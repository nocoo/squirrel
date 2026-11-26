import { AuthorizationError, authorizationErrorRedirect } from "@cloudflare/workers-oauth-provider";
import type { Context } from "hono";
import { z } from "zod";
import { generateId } from "../lib/crypto";
import { getClientPolicy, listFolders, listSecrets, upsertClientPolicy } from "../lib/db";
import { getPublicOrigin } from "../lib/env";
import type { AuthTransactionRecord, OAuthProps, WorkerBindings } from "../types";

const AUTH_TX_TTL_SECONDS = 300;
const AUTH_TX_PREFIX = "auth_tx:";

function txKvKey(txId: string): string {
  return `${AUTH_TX_PREFIX}${txId}`;
}

export async function handleAuthorizeGet(
  c: Context<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>,
): Promise<Response> {
  const url = new URL(c.req.url);
  if (url.searchParams.has("tx")) {
    return c.env.ASSETS.fetch(c.req.raw);
  }

  const provider = c.env.OAUTH_PROVIDER;
  if (!provider) {
    return c.json({ error: "OAuth provider not initialized" }, 500);
  }

  try {
    const oauthRequest = await provider.parseAuthRequest(c.req.raw);
    const clientInfo = await provider.lookupClient(oauthRequest.clientId);
    const redirectParsed = new URL(oauthRequest.redirectUri);
    const redirectHost = redirectParsed.hostname.toLowerCase();
    const redirectIsLoopback = redirectHost === "localhost" || redirectHost === "127.0.0.1";

    const txId = generateId("tx");
    const csrfToken = generateId("csrf");
    const record: AuthTransactionRecord = {
      oauthRequest,
      csrfToken,
      clientName: clientInfo?.clientName || oauthRequest.clientId,
      redirectHost: redirectParsed.host || oauthRequest.redirectUri,
      redirectIsLoopback,
      createdAt: new Date().toISOString(),
    };

    await c.env.OAUTH_KV.put(txKvKey(txId), JSON.stringify(record), {
      expirationTtl: AUTH_TX_TTL_SECONDS,
    });

    const origin = getPublicOrigin(c.req.raw, c.env);
    return Response.redirect(`${origin}/authorize?tx=${encodeURIComponent(txId)}`, 302);
  } catch (err) {
    if (err instanceof AuthorizationError && err.redirectTo) {
      return Response.redirect(err.redirectTo, 302);
    }
    const message = err instanceof Error ? err.message : "Invalid authorization request";
    return c.json({ error: "invalid_request", error_description: message }, 400);
  }
}

export async function handleGetAuthTx(
  c: Context<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>,
): Promise<Response> {
  const txId = c.req.param("txId");
  if (!txId) {
    return c.json({ error: "Missing transaction id" }, 400);
  }

  const record = await c.env.OAUTH_KV.get<AuthTransactionRecord>(txKvKey(txId), {
    type: "json",
  });
  if (!record) {
    return c.json({ error: "授权会话已过期或不存在，请重新从客户端发起授权。" }, 404);
  }

  const [existingPolicy, folders, secrets] = await Promise.all([
    getClientPolicy(c.env.DB, record.oauthRequest.clientId),
    listFolders(c.env.DB),
    listSecrets(c.env.DB),
  ]);

  return c.json({
    txId,
    csrfToken: record.csrfToken,
    clientId: record.oauthRequest.clientId,
    clientName: record.clientName,
    redirectUri: record.oauthRequest.redirectUri,
    redirectHost: record.redirectHost,
    redirectIsLoopback: record.redirectIsLoopback,
    scopes: record.oauthRequest.scope,
    existingPolicy,
    folders,
    secrets: secrets.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      service: s.service,
      folderId: s.folderId,
      folderName: s.folderName,
    })),
  });
}

const AuthDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    csrfToken: z.string().min(1),
    displayName: z.string().trim().min(1).max(100),
    allowAll: z.boolean(),
    allowedFolderIds: z.array(z.string()).default([]),
    allowedSecretIds: z.array(z.string()).default([]),
    allowPlaintextRead: z.boolean().default(true),
  }),
  z.object({
    decision: z.literal("deny"),
    csrfToken: z.string().min(1),
  }),
]);

export async function handleAuthTxDecision(
  c: Context<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>,
): Promise<Response> {
  const txId = c.req.param("txId");
  const provider = c.env.OAUTH_PROVIDER;
  if (!txId || !provider) {
    return c.json({ error: "Invalid authorization context" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = AuthDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid decision payload", issues: parsed.error.issues }, 400);
  }

  const key = txKvKey(txId);
  const record = await c.env.OAUTH_KV.get<AuthTransactionRecord>(key, { type: "json" });
  if (!record) {
    return c.json({ error: "授权会话已过期或已被使用，请重新发起授权。" }, 404);
  }

  if (parsed.data.csrfToken !== record.csrfToken) {
    return c.json({ error: "CSRF token mismatch" }, 403);
  }

  // Consume transaction immediately to prevent replay.
  await c.env.OAUTH_KV.delete(key);

  if (parsed.data.decision === "deny") {
    const redirectTo = authorizationErrorRedirect(
      record.oauthRequest,
      "access_denied",
      "Administrator declined authorization",
    );
    return c.json({ redirectTo });
  }

  const now = new Date().toISOString();
  const existing = await getClientPolicy(c.env.DB, record.oauthRequest.clientId);
  const registrationType = existing?.registrationType ?? "dcr";

  await upsertClientPolicy(c.env.DB, {
    clientId: record.oauthRequest.clientId,
    displayName: parsed.data.displayName,
    registrationType,
    allowAll: parsed.data.allowAll,
    allowedFolderIds: parsed.data.allowAll ? [] : parsed.data.allowedFolderIds,
    allowedSecretIds: parsed.data.allowAll ? [] : parsed.data.allowedSecretIds,
    allowPlaintextRead: parsed.data.allowPlaintextRead,
    status: "active",
    now,
  });

  const adminEmail = c.get("adminEmail");
  const userId = encodeURIComponent(adminEmail);
  const props: OAuthProps = {
    clientId: record.oauthRequest.clientId,
    email: adminEmail,
    authMethod: "oauth",
  };

  const grantedScopes = parsed.data.allowPlaintextRead
    ? ["secrets:list", "secrets:read"]
    : ["secrets:list"];

  const { redirectTo } = await provider.completeAuthorization({
    request: record.oauthRequest,
    userId,
    metadata: { displayName: parsed.data.displayName },
    scope: grantedScopes,
    props,
  });

  return c.json({ redirectTo });
}

import { Hono } from "hono";
import { z } from "zod";
import { handleAuthTxDecision, handleGetAuthTx } from "../auth/authorize";
import { validateRedirectUris } from "../auth/dcr-guard";
import { fetchAuthorProfile } from "../lib/author-profile";
import {
  decryptSecret,
  encryptSecret,
  generateBotToken,
  generateId,
  maskBotToken,
  maskSecretValue,
  sha256Hex,
} from "../lib/crypto";
import {
  createFolder,
  createSecret,
  deleteFolder,
  deleteSecret,
  getClientPolicy,
  getDashboardStats,
  getFolderById,
  getSecretById,
  insertAuditLog,
  listClientPolicies,
  listFolders,
  listSecrets,
  queryAuditLogs,
  updateClientPolicy,
  updateFolder,
  updateSecret,
  upsertClientPolicy,
} from "../lib/db";
import { getMasterKey } from "../lib/env";
import type { WorkerBindings } from "../types";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-_]{1,62}$/;

const FolderCreateSchema = z.object({
  slug: z.string().trim().regex(SLUG_REGEX, "Slug must be lowercase alphanumeric/dash/underscore"),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).optional().default(""),
  color: z.string().trim().min(1).max(24).optional().default("amber"),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
});

const FolderUpdateSchema = FolderCreateSchema.partial();

const SecretCreateSchema = z.object({
  folderId: z.string().trim().min(1).nullable().optional().default(null),
  slug: z.string().trim().regex(SLUG_REGEX, "Slug must be lowercase alphanumeric/dash/underscore"),
  name: z.string().trim().min(1).max(100),
  service: z.string().trim().min(1).max(60),
  value: z.string().min(1).max(16_384),
  description: z.string().trim().max(500).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  metadata: z.record(z.string(), z.string()).optional().default({}),
  isEnabled: z.boolean().optional().default(true),
  expiresAt: z.string().datetime().nullable().optional().default(null),
});

const SecretUpdateSchema = z.object({
  folderId: z.string().trim().min(1).nullable().optional(),
  slug: z.string().trim().regex(SLUG_REGEX).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  service: z.string().trim().min(1).max(60).optional(),
  value: z.string().min(1).max(16_384).optional(),
  description: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  isEnabled: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const CreateBotClientSchema = z.object({
  type: z.literal("bot_token"),
  displayName: z.string().trim().min(1).max(100),
  allowAll: z.boolean().optional().default(false),
  allowedFolderIds: z.array(z.string()).optional().default([]),
  allowedSecretIds: z.array(z.string()).optional().default([]),
  allowPlaintextRead: z.boolean().optional().default(true),
  expiresAt: z.string().datetime().nullable().optional().default(null),
});

const CreateStaticOAuthClientSchema = z.object({
  type: z.literal("static_oauth"),
  displayName: z.string().trim().min(1).max(100),
  redirectUris: z.array(z.string().min(1)).min(1).max(10),
  tokenEndpointAuthMethod: z
    .enum(["client_secret_post", "client_secret_basic", "none"])
    .optional()
    .default("client_secret_post"),
  allowAll: z.boolean().optional().default(false),
  allowedFolderIds: z.array(z.string()).optional().default([]),
  allowedSecretIds: z.array(z.string()).optional().default([]),
  allowPlaintextRead: z.boolean().optional().default(true),
});

const CreateClientSchema = z.discriminatedUnion("type", [
  CreateBotClientSchema,
  CreateStaticOAuthClientSchema,
]);

const UpdateClientSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  allowAll: z.boolean().optional(),
  allowedFolderIds: z.array(z.string()).optional(),
  allowedSecretIds: z.array(z.string()).optional(),
  allowPlaintextRead: z.boolean().optional(),
  status: z.enum(["active", "suspended", "revoked"]).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes("unique");
}

export const adminRoutes = new Hono<{
  Bindings: WorkerBindings;
  Variables: { adminEmail: string; adminName?: string | null };
}>();

adminRoutes.get("/me", async (c) => {
  const email = c.get("adminEmail");
  const profile = await fetchAuthorProfile(email);
  return c.json({
    email,
    name: profile.name ?? c.get("adminName") ?? null,
    avatar: profile.avatar,
    environment: c.env.ENVIRONMENT,
  });
});

adminRoutes.get("/stats", async (c) => {
  const daysRaw = Number(c.req.query("days") ?? "7");
  const days = Number.isFinite(daysRaw) ? daysRaw : 7;
  const stats = await getDashboardStats(c.env.DB, days);
  return c.json(stats);
});

// ─── Folders ─────────────────────────────────────────────────────────────────

adminRoutes.get("/folders", async (c) => {
  const items = await listFolders(c.env.DB);
  return c.json({ items });
});

adminRoutes.post("/folders", async (c) => {
  const parsed = FolderCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid folder payload", issues: parsed.error.issues }, 400);
  }
  try {
    const folder = await createFolder(c.env.DB, {
      id: generateId("fld"),
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color,
      sortOrder: parsed.data.sortOrder,
      now: new Date().toISOString(),
    });
    return c.json({ item: folder }, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return c.json({ error: "Folder slug already exists" }, 409);
    }
    throw err;
  }
});

adminRoutes.put("/folders/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = FolderUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid folder payload", issues: parsed.error.issues }, 400);
  }
  try {
    const updated = await updateFolder(c.env.DB, id, {
      ...parsed.data,
      now: new Date().toISOString(),
    });
    if (!updated) {
      return c.json({ error: "Folder not found" }, 404);
    }
    return c.json({ item: updated });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return c.json({ error: "Folder slug already exists" }, 409);
    }
    throw err;
  }
});

adminRoutes.delete("/folders/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteFolder(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: "Folder not found" }, 404);
  }
  return c.json({ ok: true });
});

// ─── Secrets ─────────────────────────────────────────────────────────────────

adminRoutes.get("/secrets", async (c) => {
  const items = await listSecrets(c.env.DB, {
    folderId: c.req.query("folderId") ?? undefined,
    service: c.req.query("service") ?? undefined,
    tag: c.req.query("tag") ?? undefined,
    q: c.req.query("q") ?? undefined,
  });
  return c.json({ items });
});

adminRoutes.post("/secrets", async (c) => {
  const parsed = SecretCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid secret payload", issues: parsed.error.issues }, 400);
  }

  if (parsed.data.folderId) {
    const folder = await getFolderById(c.env.DB, parsed.data.folderId);
    if (!folder) {
      return c.json({ error: "Target folder not found" }, 400);
    }
  }

  const secretId = generateId("sec");
  const masterKey = await getMasterKey(c.env);
  const encrypted = await encryptSecret(parsed.data.value, secretId, masterKey);
  const maskedPreview = maskSecretValue(parsed.data.value);
  const now = new Date().toISOString();

  try {
    const created = await createSecret(c.env.DB, {
      id: secretId,
      folderId: parsed.data.folderId ?? null,
      slug: parsed.data.slug,
      name: parsed.data.name,
      service: parsed.data.service,
      description: parsed.data.description,
      tags: parsed.data.tags,
      metadata: parsed.data.metadata,
      maskedPreview,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      isEnabled: parsed.data.isEnabled,
      expiresAt: parsed.data.expiresAt ?? null,
      now,
    });
    return c.json({ item: created }, 201);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return c.json({ error: "Secret slug already exists" }, 409);
    }
    throw err;
  }
});

adminRoutes.get("/secrets/:id/reveal", async (c) => {
  const id = c.req.param("id");
  const secret = await getSecretById(c.env.DB, id);
  if (!secret) {
    return c.json({ error: "Secret not found" }, 404);
  }

  const masterKey = await getMasterKey(c.env);
  const value = await decryptSecret(secret.ciphertext, secret.iv, secret.id, masterKey);

  await insertAuditLog(c.env.DB, {
    clientId: "admin",
    clientName: c.get("adminEmail"),
    toolName: "admin_reveal",
    secretId: secret.id,
    secretSlug: secret.slug,
    reason: "管理员在后台主动查看明文",
    decision: "allowed",
    userAgent: c.req.header("User-Agent") ?? null,
    cfRay: c.req.header("cf-ray") ?? null,
    latencyMs: 0,
    createdAt: new Date().toISOString(),
  });

  return c.json({
    id: secret.id,
    slug: secret.slug,
    value,
  });
});

adminRoutes.put("/secrets/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = SecretUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid secret update payload", issues: parsed.error.issues }, 400);
  }

  if (parsed.data.folderId) {
    const folder = await getFolderById(c.env.DB, parsed.data.folderId);
    if (!folder) {
      return c.json({ error: "Target folder not found" }, 400);
    }
  }

  let ciphertext: string | undefined;
  let iv: string | undefined;
  let maskedPreview: string | undefined;

  if (parsed.data.value !== undefined) {
    const masterKey = await getMasterKey(c.env);
    const enc = await encryptSecret(parsed.data.value, id, masterKey);
    ciphertext = enc.ciphertext;
    iv = enc.iv;
    maskedPreview = maskSecretValue(parsed.data.value);
  }

  try {
    const updated = await updateSecret(c.env.DB, id, {
      folderId: parsed.data.folderId,
      slug: parsed.data.slug,
      name: parsed.data.name,
      service: parsed.data.service,
      description: parsed.data.description,
      tags: parsed.data.tags,
      metadata: parsed.data.metadata,
      maskedPreview,
      ciphertext,
      iv,
      isEnabled: parsed.data.isEnabled,
      expiresAt: parsed.data.expiresAt,
      now: new Date().toISOString(),
    });
    if (!updated) {
      return c.json({ error: "Secret not found" }, 404);
    }
    return c.json({ item: updated });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return c.json({ error: "Secret slug already exists" }, 409);
    }
    throw err;
  }
});

adminRoutes.delete("/secrets/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await deleteSecret(c.env.DB, id);
  if (!deleted) {
    return c.json({ error: "Secret not found" }, 404);
  }
  return c.json({ ok: true });
});

// ─── Clients & Credentials ───────────────────────────────────────────────────

adminRoutes.get("/clients", async (c) => {
  const items = await listClientPolicies(c.env.DB);
  return c.json({ items });
});

adminRoutes.post("/clients", async (c) => {
  const parsed = CreateClientSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid client payload", issues: parsed.error.issues }, 400);
  }

  const now = new Date().toISOString();

  if (parsed.data.type === "bot_token") {
    const clientId = generateId("bot");
    const token = generateBotToken();
    const tokenHash = await sha256Hex(token);
    const tokenPreview = maskBotToken(token);

    const policy = await upsertClientPolicy(c.env.DB, {
      clientId,
      displayName: parsed.data.displayName,
      registrationType: "bot_token",
      tokenHash,
      tokenPreview,
      allowAll: parsed.data.allowAll,
      allowedFolderIds: parsed.data.allowAll ? [] : parsed.data.allowedFolderIds,
      allowedSecretIds: parsed.data.allowAll ? [] : parsed.data.allowedSecretIds,
      allowPlaintextRead: parsed.data.allowPlaintextRead,
      status: "active",
      expiresAt: parsed.data.expiresAt ?? null,
      now,
    });

    return c.json({ item: policy, token }, 201);
  }

  const provider = c.env.OAUTH_PROVIDER;
  if (!provider) {
    return c.json({ error: "OAuth provider not initialized" }, 500);
  }

  const redirectCheck = validateRedirectUris(parsed.data.redirectUris, c.env);
  if (!redirectCheck.ok) {
    return c.json({ error: redirectCheck.description }, 400);
  }

  const createdClient = await provider.createClient({
    clientName: parsed.data.displayName,
    redirectUris: redirectCheck.uris,
    tokenEndpointAuthMethod: parsed.data.tokenEndpointAuthMethod,
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
  });

  const policy = await upsertClientPolicy(c.env.DB, {
    clientId: createdClient.clientId,
    displayName: parsed.data.displayName,
    registrationType: "static_oauth",
    allowAll: parsed.data.allowAll,
    allowedFolderIds: parsed.data.allowAll ? [] : parsed.data.allowedFolderIds,
    allowedSecretIds: parsed.data.allowAll ? [] : parsed.data.allowedSecretIds,
    allowPlaintextRead: parsed.data.allowPlaintextRead,
    status: "active",
    now,
  });

  return c.json(
    {
      item: policy,
      oauthCredentials: {
        clientId: createdClient.clientId,
        clientSecret: createdClient.clientSecret ?? null,
        redirectUris: createdClient.redirectUris,
      },
    },
    201,
  );
});

adminRoutes.patch("/clients/:clientId", async (c) => {
  const clientId = c.req.param("clientId");
  const parsed = UpdateClientSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid client update payload", issues: parsed.error.issues }, 400);
  }

  const updated = await updateClientPolicy(c.env.DB, clientId, {
    displayName: parsed.data.displayName,
    allowAll: parsed.data.allowAll,
    allowedFolderIds: parsed.data.allowAll ? [] : parsed.data.allowedFolderIds,
    allowedSecretIds: parsed.data.allowAll ? [] : parsed.data.allowedSecretIds,
    allowPlaintextRead: parsed.data.allowPlaintextRead,
    status: parsed.data.status,
    expiresAt: parsed.data.expiresAt,
    now: new Date().toISOString(),
  });

  if (!updated) {
    return c.json({ error: "Client not found" }, 404);
  }
  return c.json({ item: updated });
});

adminRoutes.post("/clients/:clientId/rotate-token", async (c) => {
  const clientId = c.req.param("clientId");
  const existing = await getClientPolicy(c.env.DB, clientId);
  if (!existing) {
    return c.json({ error: "Client not found" }, 404);
  }
  if (existing.registrationType !== "bot_token") {
    return c.json({ error: "Only bot_token clients support token rotation" }, 400);
  }

  const token = generateBotToken();
  const tokenHash = await sha256Hex(token);
  const tokenPreview = maskBotToken(token);

  const updated = await updateClientPolicy(c.env.DB, clientId, {
    tokenHash,
    tokenPreview,
    status: "active",
    now: new Date().toISOString(),
  });

  return c.json({ item: updated, token });
});

adminRoutes.post("/clients/:clientId/revoke", async (c) => {
  const clientId = c.req.param("clientId");
  const existing = await getClientPolicy(c.env.DB, clientId);
  if (!existing) {
    return c.json({ error: "Client not found" }, 404);
  }

  const provider = c.env.OAUTH_PROVIDER;
  if (provider && existing.registrationType !== "bot_token") {
    await provider.deleteClient(clientId).catch(() => undefined);
  }

  const updated = await updateClientPolicy(c.env.DB, clientId, {
    status: "revoked",
    tokenHash: null,
    now: new Date().toISOString(),
  });

  return c.json({ item: updated });
});

// ─── OAuth Consent Transactions ──────────────────────────────────────────────

adminRoutes.get("/oauth/tx/:txId", handleGetAuthTx);
adminRoutes.post("/oauth/tx/:txId/decision", handleAuthTxDecision);

// ─── Audit Logs ──────────────────────────────────────────────────────────────

adminRoutes.get("/logs", async (c) => {
  const limitRaw = Number(c.req.query("limit") ?? "50");
  const offsetRaw = Number(c.req.query("offset") ?? "0");
  const result = await queryAuditLogs(c.env.DB, {
    clientId: c.req.query("clientId") ?? undefined,
    secretId: c.req.query("secretId") ?? undefined,
    toolName: c.req.query("toolName") ?? undefined,
    decision: c.req.query("decision") ?? undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : 50,
    offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
  });
  return c.json(result);
});

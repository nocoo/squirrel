import type { ExecutionContext } from "@cloudflare/workers-types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import pkg from "../../../package.json";
import { decryptSecret } from "../lib/crypto";
import { getSecretByIdOrSlug, listSecrets, recordSecretRead } from "../lib/db";
import { getMasterKey } from "../lib/env";
import type { McpCallerContext, WorkerBindings } from "../types";
import {
  evaluateSecretRead,
  filterAccessibleSecrets,
  loadActivePolicyAndTouch,
  writeToolAudit,
} from "./policy";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const SERVER_INSTRUCTIONS =
  "Squirrel personal API key and token vault for developer services (Cloudflare, GitHub, OpenAI, Vercel, Notion, etc.). Whenever a user request requires an API key, access token, webhook secret, or service endpoint configuration, call search_secrets or list_secrets first to check whether a credential is already stored before asking the user. Only call get_secret after identifying the exact secret_id or slug, and always supply a concise reason.";

function textResult(payload: unknown, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

export function buildMcpServer(
  env: WorkerBindings,
  caller: McpCallerContext,
  ctx?: Pick<ExecutionContext, "waitUntil">,
): McpServer {
  const server = new McpServer(
    {
      name: "squirrel-mcp",
      version: pkg.version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const scheduleAudit = (promise: Promise<void>) => {
    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
      return promise;
    }
    return promise;
  };

  server.registerTool(
    "whoami",
    {
      title: "Who Am I",
      description:
        "Inspect the current authenticated client identity, authorized folders, individual secret grants, and accessible secret count.",
      inputSchema: {},
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      const startedAtMs = Date.now();
      const nowIso = new Date().toISOString();
      const active = await loadActivePolicyAndTouch(env.DB, caller, nowIso);
      if (!active.ok) {
        await scheduleAudit(
          writeToolAudit(env.DB, caller, {
            toolName: "whoami",
            decision: "denied",
            errorCode: "CLIENT_INACTIVE",
            startedAtMs,
          }),
        );
        return textResult({ error: "CLIENT_INACTIVE", message: active.message }, true);
      }

      const allSecrets = await listSecrets(env.DB);
      const accessible = filterAccessibleSecrets(active.policy, allSecrets);

      await scheduleAudit(
        writeToolAudit(env.DB, caller, {
          toolName: "whoami",
          decision: "allowed",
          startedAtMs,
        }),
      );

      return textResult({
        clientId: caller.clientId,
        displayName: active.policy.displayName,
        registrationType: active.policy.registrationType,
        authMethod: caller.authMethod,
        allowAll: active.policy.allowAll,
        allowedFolderIds: active.policy.allowedFolderIds,
        allowedSecretIds: active.policy.allowedSecretIds,
        allowPlaintextRead: active.policy.allowPlaintextRead,
        accessibleSecretCount: accessible.length,
        scopes: caller.scopes,
      });
    },
  );

  server.registerTool(
    "list_secrets",
    {
      title: "List Secrets",
      description:
        "List metadata for all secrets authorized for the current client (never returns plaintext values). Supports optional filtering by service, tag, or folder.",
      inputSchema: {
        service: z.string().trim().max(60).optional().describe("Filter by service name"),
        tag: z.string().trim().max(40).optional().describe("Filter by tag"),
        folder: z.string().trim().max(64).optional().describe("Filter by folder id, slug, or name"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const startedAtMs = Date.now();
      const nowIso = new Date().toISOString();
      const active = await loadActivePolicyAndTouch(env.DB, caller, nowIso);
      if (!active.ok) {
        await scheduleAudit(
          writeToolAudit(env.DB, caller, {
            toolName: "list_secrets",
            decision: "denied",
            errorCode: "CLIENT_INACTIVE",
            startedAtMs,
          }),
        );
        return textResult({ error: "CLIENT_INACTIVE", message: active.message }, true);
      }

      const allSecrets = await listSecrets(env.DB);
      const filtered = filterAccessibleSecrets(active.policy, allSecrets, {
        service: args.service,
        tag: args.tag,
        folder: args.folder,
      });

      await scheduleAudit(
        writeToolAudit(env.DB, caller, {
          toolName: "list_secrets",
          decision: "allowed",
          startedAtMs,
        }),
      );

      return textResult({
        total: filtered.length,
        secrets: filtered.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          service: s.service,
          folderId: s.folderId,
          folderName: s.folderName,
          folderSlug: s.folderSlug,
          description: s.description,
          tags: s.tags,
          metadata: s.metadata,
          maskedPreview: s.maskedPreview,
          isEnabled: s.isEnabled,
          expiresAt: s.expiresAt,
        })),
      });
    },
  );

  server.registerTool(
    "search_secrets",
    {
      title: "Search Secrets",
      description:
        "Fuzzy search authorized secret metadata by keyword across name, slug, service, folder, tags, and description (never returns plaintext values).",
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Keyword to match against secret name, slug, service, folder, or tags"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const startedAtMs = Date.now();
      const nowIso = new Date().toISOString();
      const active = await loadActivePolicyAndTouch(env.DB, caller, nowIso);
      if (!active.ok) {
        await scheduleAudit(
          writeToolAudit(env.DB, caller, {
            toolName: "search_secrets",
            reason: args.query,
            decision: "denied",
            errorCode: "CLIENT_INACTIVE",
            startedAtMs,
          }),
        );
        return textResult({ error: "CLIENT_INACTIVE", message: active.message }, true);
      }

      const allSecrets = await listSecrets(env.DB);
      const matches = filterAccessibleSecrets(active.policy, allSecrets, { query: args.query });

      await scheduleAudit(
        writeToolAudit(env.DB, caller, {
          toolName: "search_secrets",
          reason: args.query,
          decision: "allowed",
          startedAtMs,
        }),
      );

      return textResult({
        total: matches.length,
        secrets: matches.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          service: s.service,
          folderId: s.folderId,
          folderName: s.folderName,
          folderSlug: s.folderSlug,
          description: s.description,
          tags: s.tags,
          metadata: s.metadata,
          maskedPreview: s.maskedPreview,
          isEnabled: s.isEnabled,
          expiresAt: s.expiresAt,
        })),
      });
    },
  );

  server.registerTool(
    "get_secret",
    {
      title: "Get Secret",
      description:
        "Decrypt and retrieve a secret plaintext value and non-sensitive metadata by secret_id or slug. Requires a concise reason recorded in audit logs.",
      inputSchema: {
        secret_id: z
          .string()
          .trim()
          .min(1)
          .describe("Secret ID (sec_...) or unique slug returned by list_secrets/search_secrets"),
        reason: z
          .string()
          .trim()
          .min(3)
          .max(200)
          .describe("Concise explanation of why this credential is needed now (logged for audit)"),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const startedAtMs = Date.now();
      const nowIso = new Date().toISOString();
      const active = await loadActivePolicyAndTouch(env.DB, caller, nowIso);
      if (!active.ok) {
        await scheduleAudit(
          writeToolAudit(env.DB, caller, {
            toolName: "get_secret",
            secretId: args.secret_id,
            reason: args.reason,
            decision: "denied",
            errorCode: "CLIENT_INACTIVE",
            startedAtMs,
          }),
        );
        return textResult({ error: "CLIENT_INACTIVE", message: active.message }, true);
      }

      const secret = await getSecretByIdOrSlug(env.DB, args.secret_id);
      const hasReadScope =
        caller.authMethod === "bot_token" || caller.scopes.includes("secrets:read");
      const evaluation = evaluateSecretRead(active.policy, secret, hasReadScope, nowIso);

      if (!evaluation.ok || !secret) {
        const auditDecision = evaluation.ok ? "not_found" : evaluation.decision;
        const auditErrorCode = evaluation.ok ? "SECRET_NOT_FOUND" : evaluation.errorCode;
        await scheduleAudit(
          writeToolAudit(env.DB, caller, {
            toolName: "get_secret",
            secretId: secret?.id ?? args.secret_id,
            secretSlug: secret?.slug ?? null,
            reason: args.reason,
            decision: auditDecision,
            errorCode: auditErrorCode,
            startedAtMs,
          }),
        );
        const maskExistence = !evaluation.ok && evaluation.errorCode === "ACCESS_DENIED";
        return textResult(
          {
            error: maskExistence ? "SECRET_NOT_FOUND" : auditErrorCode,
            message:
              evaluation.ok || maskExistence
                ? "未找到指定的密钥记录，请先调用 search_secrets 或 list_secrets 确认可用标识。"
                : evaluation.message,
          },
          true,
        );
      }

      const masterKey = await getMasterKey(env);
      const plaintext = await decryptSecret(secret.ciphertext, secret.iv, secret.id, masterKey);
      await recordSecretRead(env.DB, secret.id, nowIso);

      await scheduleAudit(
        writeToolAudit(env.DB, caller, {
          toolName: "get_secret",
          secretId: secret.id,
          secretSlug: secret.slug,
          reason: args.reason,
          decision: "allowed",
          startedAtMs,
        }),
      );

      return textResult({
        id: secret.id,
        slug: secret.slug,
        name: secret.name,
        service: secret.service,
        folderId: secret.folderId,
        folderName: secret.folderName,
        value: plaintext,
        metadata: secret.metadata,
        expiresAt: secret.expiresAt,
      });
    },
  );

  return server;
}

export async function handleMcpRequest(
  request: Request,
  env: WorkerBindings,
  caller: McpCallerContext,
  ctx?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  if (request.method === "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildMcpServer(env, caller, ctx);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => undefined);
  }
}

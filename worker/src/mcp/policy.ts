import { getClientPolicy, insertAuditLog, touchClientUsage } from "../lib/db";
import type { AuditDecision, ClientPolicyRecord, McpCallerContext, SecretSummary } from "../types";

function parseIsoTimestamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

function isExpired(expiresAt: string | null | undefined, nowIso: string): boolean {
  const expiryTs = parseIsoTimestamp(expiresAt);
  if (expiryTs === null) return false;
  const nowTs = parseIsoTimestamp(nowIso) ?? Date.now();
  return expiryTs <= nowTs;
}

export function isPolicyActive(policy: ClientPolicyRecord, nowIso: string): boolean {
  if (policy.status !== "active") {
    return false;
  }
  if (isExpired(policy.expiresAt, nowIso)) {
    return false;
  }
  return true;
}

export function canAccessSecret(
  policy: ClientPolicyRecord,
  secret: Pick<SecretSummary, "id" | "folderId">,
): boolean {
  if (policy.allowAll) {
    return true;
  }
  if (secret.folderId && policy.allowedFolderIds.includes(secret.folderId)) {
    return true;
  }
  return policy.allowedSecretIds.includes(secret.id);
}

export function filterAccessibleSecrets(
  policy: ClientPolicyRecord,
  secrets: SecretSummary[],
  filters?: {
    service?: string;
    tag?: string;
    folder?: string;
    query?: string;
  },
): SecretSummary[] {
  let result = secrets.filter((s) => canAccessSecret(policy, s));

  if (filters?.service) {
    const svc = filters.service.trim().toLowerCase();
    result = result.filter((s) => s.service.toLowerCase() === svc);
  }

  if (filters?.tag) {
    const tag = filters.tag.trim().toLowerCase();
    result = result.filter((s) => s.tags.some((t) => t.toLowerCase() === tag));
  }

  if (filters?.folder) {
    const folder = filters.folder.trim().toLowerCase();
    result = result.filter(
      (s) =>
        s.folderId?.toLowerCase() === folder ||
        s.folderSlug?.toLowerCase() === folder ||
        s.folderName?.toLowerCase() === folder,
    );
  }

  if (filters?.query) {
    const q = filters.query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.service.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.folderName?.toLowerCase().includes(q) ?? false) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
  }

  return result;
}

export type SecretReadEvaluation =
  | { ok: true }
  | { ok: false; decision: AuditDecision; errorCode: string; message: string };

export function evaluateSecretRead(
  policy: ClientPolicyRecord | null,
  secret: SecretSummary | null,
  hasReadScope: boolean,
  nowIso: string,
): SecretReadEvaluation {
  if (!policy) {
    return {
      ok: false,
      decision: "denied",
      errorCode: "CLIENT_NOT_AUTHORIZED",
      message: "当前客户端尚未在 Squirrel 管理后台完成授权配置。",
    };
  }
  if (!isPolicyActive(policy, nowIso)) {
    return {
      ok: false,
      decision: "denied",
      errorCode: "CLIENT_INACTIVE",
      message: `当前客户端状态为 ${policy.status} 或已过期，访问已被拒绝。`,
    };
  }
  if (!secret) {
    return {
      ok: false,
      decision: "not_found",
      errorCode: "SECRET_NOT_FOUND",
      message: "未找到指定的密钥记录，请先调用 search_secrets 或 list_secrets 确认可用标识。",
    };
  }
  if (!canAccessSecret(policy, secret)) {
    return {
      ok: false,
      decision: "denied",
      errorCode: "ACCESS_DENIED",
      message: "当前客户端未被授权访问该密钥或其所属文件夹，请在 Squirrel 管理后台调整权限。",
    };
  }
  if (!policy.allowPlaintextRead || !hasReadScope) {
    return {
      ok: false,
      decision: "denied",
      errorCode: "PLAINTEXT_READ_DISABLED",
      message: "当前客户端仅被授予元数据检索权限，无权读取明文密钥。",
    };
  }
  if (!secret.isEnabled) {
    return {
      ok: false,
      decision: "disabled",
      errorCode: "SECRET_DISABLED",
      message: `密钥 [${secret.slug}] 当前处于停用状态。`,
    };
  }
  if (isExpired(secret.expiresAt, nowIso)) {
    return {
      ok: false,
      decision: "expired",
      errorCode: "SECRET_EXPIRED",
      message: `密钥 [${secret.slug}] 已于 ${secret.expiresAt} 过期，请在后台轮换更新。`,
    };
  }
  return { ok: true };
}

export async function loadActivePolicyAndTouch(
  db: D1Database,
  caller: McpCallerContext,
  nowIso: string,
): Promise<{ ok: true; policy: ClientPolicyRecord } | { ok: false; message: string }> {
  const policy = await getClientPolicy(db, caller.clientId);
  if (!policy) {
    return {
      ok: false,
      message: "当前客户端策略不存在，请重新完成授权或联系管理员。",
    };
  }
  if (!isPolicyActive(policy, nowIso)) {
    return {
      ok: false,
      message: `当前客户端凭证已停用或过期（状态：${policy.status}）。`,
    };
  }
  await touchClientUsage(db, caller.clientId, caller.userAgent, nowIso);
  return { ok: true, policy };
}

export async function writeToolAudit(
  db: D1Database,
  caller: McpCallerContext,
  params: {
    toolName: string;
    secretId?: string | null;
    secretSlug?: string | null;
    reason?: string | null;
    decision: AuditDecision;
    errorCode?: string | null;
    startedAtMs: number;
  },
): Promise<void> {
  await insertAuditLog(db, {
    clientId: caller.clientId,
    clientName: caller.clientName,
    toolName: params.toolName,
    secretId: params.secretId ?? null,
    secretSlug: params.secretSlug ?? null,
    reason: params.reason ?? null,
    decision: params.decision,
    errorCode: params.errorCode ?? null,
    userAgent: caller.userAgent,
    cfRay: caller.cfRay,
    latencyMs: Math.max(0, Date.now() - params.startedAtMs),
    createdAt: new Date().toISOString(),
  });
}

import type {
  AuditDecision,
  AuditLogRecord,
  ClientPolicyRecord,
  ClientStatus,
  DashboardStatsResponse,
  FolderRecord,
  RegistrationType,
  SecretSummary,
  SecretWithCiphertext,
} from "../types";

interface FolderRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  secret_count?: number;
  created_at: string;
  updated_at: string;
}

interface SecretRow {
  id: string;
  folder_id: string | null;
  folder_name?: string | null;
  folder_slug?: string | null;
  slug: string;
  name: string;
  service: string;
  description: string;
  tags_json: string;
  metadata_json: string;
  masked_preview: string;
  ciphertext: string;
  iv: string;
  key_version: number;
  is_enabled: number;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

interface ClientPolicyRow {
  client_id: string;
  display_name: string;
  registration_type: string;
  token_hash: string | null;
  token_preview: string | null;
  allow_all: number;
  allowed_folder_ids_json: string;
  allowed_secret_ids_json: string;
  allow_plaintext_read: number;
  status: string;
  expires_at: string | null;
  user_agent_hint: string | null;
  last_used_at: string | null;
  call_count: number;
  created_at: string;
  updated_at: string;
}

interface AuditLogRow {
  id: number;
  client_id: string;
  client_name: string;
  tool_name: string;
  secret_id: string | null;
  secret_slug: string | null;
  reason: string | null;
  decision: string;
  error_code: string | null;
  user_agent: string | null;
  cf_ray: string | null;
  latency_ms: number | null;
  created_at: string;
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function safeJsonRecord(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

function mapFolder(row: FolderRow): FolderRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    color: row.color,
    sortOrder: Number(row.sort_order),
    secretCount: Number(row.secret_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSecretSummary(row: SecretRow): SecretSummary {
  return {
    id: row.id,
    folderId: row.folder_id,
    folderName: row.folder_name ?? null,
    folderSlug: row.folder_slug ?? null,
    slug: row.slug,
    name: row.name,
    service: row.service,
    description: row.description,
    tags: safeJsonArray(row.tags_json),
    metadata: safeJsonRecord(row.metadata_json),
    maskedPreview: row.masked_preview,
    keyVersion: Number(row.key_version),
    isEnabled: Number(row.is_enabled) === 1,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    useCount: Number(row.use_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSecretWithCiphertext(row: SecretRow): SecretWithCiphertext {
  return {
    ...mapSecretSummary(row),
    ciphertext: row.ciphertext,
    iv: row.iv,
  };
}

function mapClientPolicy(row: ClientPolicyRow): ClientPolicyRecord {
  return {
    clientId: row.client_id,
    displayName: row.display_name,
    registrationType: row.registration_type as RegistrationType,
    tokenPreview: row.token_preview,
    allowAll: Number(row.allow_all) === 1,
    allowedFolderIds: safeJsonArray(row.allowed_folder_ids_json),
    allowedSecretIds: safeJsonArray(row.allowed_secret_ids_json),
    allowPlaintextRead: Number(row.allow_plaintext_read) === 1,
    status: row.status as ClientStatus,
    expiresAt: row.expires_at,
    userAgentHint: row.user_agent_hint,
    lastUsedAt: row.last_used_at,
    callCount: Number(row.call_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditLog(row: AuditLogRow): AuditLogRecord {
  return {
    id: Number(row.id),
    clientId: row.client_id,
    clientName: row.client_name,
    toolName: row.tool_name,
    secretId: row.secret_id,
    secretSlug: row.secret_slug,
    reason: row.reason,
    decision: row.decision as AuditDecision,
    errorCode: row.error_code,
    userAgent: row.user_agent,
    cfRay: row.cf_ray,
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    createdAt: row.created_at,
  };
}

export async function listFolders(db: D1Database): Promise<FolderRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT f.*, COUNT(s.id) AS secret_count
       FROM folders f
       LEFT JOIN secrets s ON s.folder_id = f.id
       GROUP BY f.id
       ORDER BY f.sort_order ASC, f.name ASC`,
    )
    .all<FolderRow>();
  return results.map(mapFolder);
}

export async function getFolderById(db: D1Database, id: string): Promise<FolderRecord | null> {
  const row = await db
    .prepare(
      `SELECT f.*, COUNT(s.id) AS secret_count
       FROM folders f
       LEFT JOIN secrets s ON s.folder_id = f.id
       WHERE f.id = ?
       GROUP BY f.id`,
    )
    .bind(id)
    .first<FolderRow>();
  return row ? mapFolder(row) : null;
}

export async function createFolder(
  db: D1Database,
  input: {
    id: string;
    slug: string;
    name: string;
    description: string;
    color: string;
    sortOrder: number;
    now: string;
  },
): Promise<FolderRecord> {
  await db
    .prepare(
      `INSERT INTO folders (id, slug, name, description, color, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.slug,
      input.name,
      input.description,
      input.color,
      input.sortOrder,
      input.now,
      input.now,
    )
    .run();
  const created = await getFolderById(db, input.id);
  if (!created) throw new Error("Failed to load newly created folder");
  return created;
}

export async function updateFolder(
  db: D1Database,
  id: string,
  patch: {
    slug?: string;
    name?: string;
    description?: string;
    color?: string;
    sortOrder?: number;
    now: string;
  },
): Promise<FolderRecord | null> {
  const existing = await getFolderById(db, id);
  if (!existing) return null;

  await db
    .prepare(
      `UPDATE folders
       SET slug = ?, name = ?, description = ?, color = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      patch.slug ?? existing.slug,
      patch.name ?? existing.name,
      patch.description ?? existing.description,
      patch.color ?? existing.color,
      patch.sortOrder ?? existing.sortOrder,
      patch.now,
      id,
    )
    .run();
  return getFolderById(db, id);
}

async function prunePolicyIdReference(
  db: D1Database,
  field: "allowedFolderIds" | "allowedSecretIds",
  removedId: string,
): Promise<void> {
  const policies = await listClientPolicies(db);
  const column =
    field === "allowedFolderIds" ? "allowed_folder_ids_json" : "allowed_secret_ids_json";
  const now = new Date().toISOString();
  for (const policy of policies) {
    const list = policy[field];
    if (!list.includes(removedId)) continue;
    const filtered = list.filter((entry) => entry !== removedId);
    await db
      .prepare(`UPDATE oauth_client_policies SET ${column} = ?, updated_at = ? WHERE client_id = ?`)
      .bind(JSON.stringify(filtered), now, policy.clientId)
      .run();
  }
}

export async function deleteFolder(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
  const deleted = (res.meta.changes ?? 0) > 0;
  if (deleted) {
    await prunePolicyIdReference(db, "allowedFolderIds", id);
  }
  return deleted;
}

export async function listSecrets(
  db: D1Database,
  filters?: {
    folderId?: string;
    service?: string;
    tag?: string;
    q?: string;
  },
): Promise<SecretSummary[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.folderId === "__uncategorized__") {
    conditions.push("s.folder_id IS NULL");
  } else if (filters?.folderId) {
    conditions.push("s.folder_id = ?");
    params.push(filters.folderId);
  }

  if (filters?.service) {
    conditions.push("LOWER(s.service) = LOWER(?)");
    params.push(filters.service);
  }

  const SECRET_SUMMARY_COLUMNS =
    "s.id, s.folder_id, s.slug, s.name, s.service, s.description, s.tags_json, s.metadata_json, s.masked_preview, s.key_version, s.is_enabled, s.expires_at, s.last_used_at, s.use_count, s.created_at, s.updated_at";

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT ${SECRET_SUMMARY_COLUMNS}, f.name AS folder_name, f.slug AS folder_slug
               FROM secrets s
               LEFT JOIN folders f ON f.id = s.folder_id
               ${where}
               ORDER BY s.updated_at DESC, s.name ASC`;

  const stmt = db.prepare(sql);
  const { results } =
    params.length > 0 ? await stmt.bind(...params).all<SecretRow>() : await stmt.all<SecretRow>();

  let items = results.map(mapSecretSummary);

  if (filters?.tag) {
    const targetTag = filters.tag.toLowerCase();
    items = items.filter((item) => item.tags.some((t) => t.toLowerCase() === targetTag));
  }

  if (filters?.q) {
    const q = filters.q.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.slug.toLowerCase().includes(q) ||
          item.service.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.folderName?.toLowerCase().includes(q) ?? false) ||
          item.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
  }

  return items;
}

export async function getSecretById(
  db: D1Database,
  id: string,
): Promise<SecretWithCiphertext | null> {
  const row = await db
    .prepare(
      `SELECT s.*, f.name AS folder_name, f.slug AS folder_slug
       FROM secrets s
       LEFT JOIN folders f ON f.id = s.folder_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<SecretRow>();
  return row ? mapSecretWithCiphertext(row) : null;
}

export async function getSecretByIdOrSlug(
  db: D1Database,
  idOrSlug: string,
): Promise<SecretWithCiphertext | null> {
  const row = await db
    .prepare(
      `SELECT s.*, f.name AS folder_name, f.slug AS folder_slug
       FROM secrets s
       LEFT JOIN folders f ON f.id = s.folder_id
       WHERE s.id = ? OR s.slug = ?
       LIMIT 1`,
    )
    .bind(idOrSlug, idOrSlug)
    .first<SecretRow>();
  return row ? mapSecretWithCiphertext(row) : null;
}

export async function createSecret(
  db: D1Database,
  input: {
    id: string;
    folderId: string | null;
    slug: string;
    name: string;
    service: string;
    description: string;
    tags: string[];
    metadata: Record<string, string>;
    maskedPreview: string;
    ciphertext: string;
    iv: string;
    isEnabled: boolean;
    expiresAt: string | null;
    now: string;
  },
): Promise<SecretSummary> {
  await db
    .prepare(
      `INSERT INTO secrets (
        id, folder_id, slug, name, service, description, tags_json, metadata_json,
        masked_preview, ciphertext, iv, key_version, is_enabled, expires_at,
        last_used_at, use_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 0, ?, ?)`,
    )
    .bind(
      input.id,
      input.folderId,
      input.slug,
      input.name,
      input.service,
      input.description,
      JSON.stringify(input.tags),
      JSON.stringify(input.metadata),
      input.maskedPreview,
      input.ciphertext,
      input.iv,
      input.isEnabled ? 1 : 0,
      input.expiresAt,
      input.now,
      input.now,
    )
    .run();

  const created = await getSecretById(db, input.id);
  if (!created) throw new Error("Failed to load newly created secret");
  const { ciphertext: _c, iv: _i, ...summary } = created;
  return summary;
}

export async function updateSecret(
  db: D1Database,
  id: string,
  patch: {
    folderId?: string | null;
    slug?: string;
    name?: string;
    service?: string;
    description?: string;
    tags?: string[];
    metadata?: Record<string, string>;
    maskedPreview?: string;
    ciphertext?: string;
    iv?: string;
    isEnabled?: boolean;
    expiresAt?: string | null;
    now: string;
  },
): Promise<SecretSummary | null> {
  const existing = await getSecretById(db, id);
  if (!existing) return null;

  await db
    .prepare(
      `UPDATE secrets
       SET folder_id = ?, slug = ?, name = ?, service = ?, description = ?,
           tags_json = ?, metadata_json = ?, masked_preview = ?, ciphertext = ?, iv = ?,
           is_enabled = ?, expires_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      patch.folderId !== undefined ? patch.folderId : existing.folderId,
      patch.slug ?? existing.slug,
      patch.name ?? existing.name,
      patch.service ?? existing.service,
      patch.description ?? existing.description,
      JSON.stringify(patch.tags ?? existing.tags),
      JSON.stringify(patch.metadata ?? existing.metadata),
      patch.maskedPreview ?? existing.maskedPreview,
      patch.ciphertext ?? existing.ciphertext,
      patch.iv ?? existing.iv,
      (patch.isEnabled ?? existing.isEnabled) ? 1 : 0,
      patch.expiresAt !== undefined ? patch.expiresAt : existing.expiresAt,
      patch.now,
      id,
    )
    .run();

  const updated = await getSecretById(db, id);
  if (!updated) return null;
  const { ciphertext: _c, iv: _i, ...summary } = updated;
  return summary;
}

export async function deleteSecret(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM secrets WHERE id = ?").bind(id).run();
  const deleted = (res.meta.changes ?? 0) > 0;
  if (deleted) {
    await prunePolicyIdReference(db, "allowedSecretIds", id);
  }
  return deleted;
}

export async function recordSecretRead(
  db: D1Database,
  secretId: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE secrets
       SET use_count = use_count + 1, last_used_at = ?
       WHERE id = ?`,
    )
    .bind(nowIso, secretId)
    .run();
}

export async function listClientPolicies(db: D1Database): Promise<ClientPolicyRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM oauth_client_policies ORDER BY updated_at DESC, display_name ASC")
    .all<ClientPolicyRow>();
  return results.map(mapClientPolicy);
}

export async function getClientPolicy(
  db: D1Database,
  clientId: string,
): Promise<ClientPolicyRecord | null> {
  const row = await db
    .prepare("SELECT * FROM oauth_client_policies WHERE client_id = ?")
    .bind(clientId)
    .first<ClientPolicyRow>();
  return row ? mapClientPolicy(row) : null;
}

export async function getClientPolicyByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<ClientPolicyRecord | null> {
  const row = await db
    .prepare("SELECT * FROM oauth_client_policies WHERE token_hash = ?")
    .bind(tokenHash)
    .first<ClientPolicyRow>();
  return row ? mapClientPolicy(row) : null;
}

export async function upsertClientPolicy(
  db: D1Database,
  input: {
    clientId: string;
    displayName: string;
    registrationType: RegistrationType;
    tokenHash?: string | null;
    tokenPreview?: string | null;
    allowAll: boolean;
    allowedFolderIds: string[];
    allowedSecretIds: string[];
    allowPlaintextRead: boolean;
    status: ClientStatus;
    expiresAt?: string | null;
    now: string;
  },
): Promise<ClientPolicyRecord> {
  const existing = await getClientPolicy(db, input.clientId);
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO oauth_client_policies (
          client_id, display_name, registration_type, token_hash, token_preview,
          allow_all, allowed_folder_ids_json, allowed_secret_ids_json,
          allow_plaintext_read, status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.clientId,
        input.displayName,
        input.registrationType,
        input.tokenHash ?? null,
        input.tokenPreview ?? null,
        input.allowAll ? 1 : 0,
        JSON.stringify(input.allowedFolderIds),
        JSON.stringify(input.allowedSecretIds),
        input.allowPlaintextRead ? 1 : 0,
        input.status,
        input.expiresAt ?? null,
        input.now,
        input.now,
      )
      .run();
  } else {
    await db
      .prepare(
        `UPDATE oauth_client_policies
         SET display_name = ?, allow_all = ?, allowed_folder_ids_json = ?,
             allowed_secret_ids_json = ?, allow_plaintext_read = ?, status = ?,
             expires_at = ?, updated_at = ?
         WHERE client_id = ?`,
      )
      .bind(
        input.displayName,
        input.allowAll ? 1 : 0,
        JSON.stringify(input.allowedFolderIds),
        JSON.stringify(input.allowedSecretIds),
        input.allowPlaintextRead ? 1 : 0,
        input.status,
        input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
        input.now,
        input.clientId,
      )
      .run();
  }

  const saved = await getClientPolicy(db, input.clientId);
  if (!saved) throw new Error("Failed to load client policy after upsert");
  return saved;
}

export async function updateClientPolicy(
  db: D1Database,
  clientId: string,
  patch: {
    displayName?: string;
    allowAll?: boolean;
    allowedFolderIds?: string[];
    allowedSecretIds?: string[];
    allowPlaintextRead?: boolean;
    status?: ClientStatus;
    expiresAt?: string | null;
    tokenHash?: string | null;
    tokenPreview?: string | null;
    now: string;
  },
): Promise<ClientPolicyRecord | null> {
  const existing = await getClientPolicy(db, clientId);
  if (!existing) return null;

  const updates: string[] = [
    "display_name = ?",
    "allow_all = ?",
    "allowed_folder_ids_json = ?",
    "allowed_secret_ids_json = ?",
    "allow_plaintext_read = ?",
    "status = ?",
    "expires_at = ?",
    "updated_at = ?",
  ];
  const params: unknown[] = [
    patch.displayName ?? existing.displayName,
    (patch.allowAll ?? existing.allowAll) ? 1 : 0,
    JSON.stringify(patch.allowedFolderIds ?? existing.allowedFolderIds),
    JSON.stringify(patch.allowedSecretIds ?? existing.allowedSecretIds),
    (patch.allowPlaintextRead ?? existing.allowPlaintextRead) ? 1 : 0,
    patch.status ?? existing.status,
    patch.expiresAt !== undefined ? patch.expiresAt : existing.expiresAt,
    patch.now,
  ];

  if (patch.tokenHash !== undefined) {
    updates.push("token_hash = ?");
    params.push(patch.tokenHash);
  }
  if (patch.tokenPreview !== undefined) {
    updates.push("token_preview = ?");
    params.push(patch.tokenPreview);
  }
  params.push(clientId);

  await db
    .prepare(`UPDATE oauth_client_policies SET ${updates.join(", ")} WHERE client_id = ?`)
    .bind(...params)
    .run();

  return getClientPolicy(db, clientId);
}

export async function deleteClientPolicy(db: D1Database, clientId: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM oauth_client_policies WHERE client_id = ?")
    .bind(clientId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function touchClientUsage(
  db: D1Database,
  clientId: string,
  userAgent: string | null,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE oauth_client_policies
       SET call_count = call_count + 1,
           last_used_at = ?,
           user_agent_hint = COALESCE(?, user_agent_hint)
       WHERE client_id = ?`,
    )
    .bind(nowIso, userAgent, clientId)
    .run();
}

export async function insertAuditLog(
  db: D1Database,
  entry: {
    clientId: string;
    clientName: string;
    toolName: string;
    secretId?: string | null;
    secretSlug?: string | null;
    reason?: string | null;
    decision: AuditDecision;
    errorCode?: string | null;
    userAgent?: string | null;
    cfRay?: string | null;
    latencyMs?: number | null;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (
        client_id, client_name, tool_name, secret_id, secret_slug,
        reason, decision, error_code, user_agent, cf_ray, latency_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.clientId,
      entry.clientName,
      entry.toolName,
      entry.secretId ?? null,
      entry.secretSlug ?? null,
      entry.reason ?? null,
      entry.decision,
      entry.errorCode ?? null,
      entry.userAgent ?? null,
      entry.cfRay ?? null,
      entry.latencyMs ?? null,
      entry.createdAt,
    )
    .run();
}

export async function queryAuditLogs(
  db: D1Database,
  filters: {
    clientId?: string;
    secretId?: string;
    toolName?: string;
    decision?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ items: AuditLogRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.clientId) {
    conditions.push("client_id = ?");
    params.push(filters.clientId);
  }
  if (filters.secretId) {
    conditions.push("secret_id = ?");
    params.push(filters.secretId);
  }
  if (filters.toolName) {
    conditions.push("tool_name = ?");
    params.push(filters.toolName);
  }
  if (filters.decision) {
    conditions.push("decision = ?");
    params.push(filters.decision);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countStmt = db.prepare(`SELECT COUNT(*) AS cnt FROM audit_logs ${where}`);
  const countRow =
    params.length > 0
      ? await countStmt.bind(...params).first<{ cnt: number }>()
      : await countStmt.first<{ cnt: number }>();

  const listStmt = db.prepare(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
  );
  const { results } = await listStmt.bind(...params, limit, offset).all<AuditLogRow>();

  return {
    items: results.map(mapAuditLog),
    total: Number(countRow?.cnt ?? 0),
  };
}

export async function purgeExpiredAuditLogs(
  db: D1Database,
  retentionDays = 90,
  nowMs = Date.now(),
): Promise<number> {
  const cutoff = new Date(nowMs - retentionDays * 86_400_000).toISOString();
  const res = await db.prepare("DELETE FROM audit_logs WHERE created_at < ?").bind(cutoff).run();
  return res.meta.changes ?? 0;
}

export async function getDashboardStats(
  db: D1Database,
  days = 7,
  nowMs = Date.now(),
): Promise<DashboardStatsResponse> {
  const clampedDays = Math.min(Math.max(days, 1), 90);
  const sinceIso = new Date(nowMs - clampedDays * 86_400_000).toISOString();
  const prevSinceIso = new Date(nowMs - clampedDays * 2 * 86_400_000).toISOString();
  const soonIso = new Date(nowMs + 30 * 86_400_000).toISOString();
  const staleCutoffIso = new Date(nowMs - 90 * 86_400_000).toISOString();

  const [
    secretCounts,
    folderCount,
    clientCount,
    auditTotals,
    prevAuditTotals,
    dailyRows,
    clientRows,
    topSecretRows,
    staleRows,
    expiringRows,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN is_enabled = 1 THEN 1 ELSE 0 END) AS enabled,
                SUM(CASE WHEN is_enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END) AS expiring_soon
         FROM secrets`,
      )
      .bind(soonIso)
      .first<{ total: number; enabled: number | null; expiring_soon: number | null }>(),
    db.prepare("SELECT COUNT(*) AS cnt FROM folders").first<{ cnt: number }>(),
    db
      .prepare("SELECT COUNT(*) AS cnt FROM oauth_client_policies WHERE status = 'active'")
      .first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN decision = 'allowed' THEN 1 ELSE 0 END) AS allowed,
                SUM(CASE WHEN decision != 'allowed' THEN 1 ELSE 0 END) AS denied
         FROM audit_logs
         WHERE created_at >= ?`,
      )
      .bind(sinceIso)
      .first<{ total: number; allowed: number | null; denied: number | null }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN decision = 'allowed' THEN 1 ELSE 0 END) AS allowed,
                SUM(CASE WHEN decision != 'allowed' THEN 1 ELSE 0 END) AS denied
         FROM audit_logs
         WHERE created_at >= ? AND created_at < ?`,
      )
      .bind(prevSinceIso, sinceIso)
      .first<{ total: number; allowed: number | null; denied: number | null }>(),
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day,
                SUM(CASE WHEN decision = 'allowed' THEN 1 ELSE 0 END) AS allowed,
                SUM(CASE WHEN decision != 'allowed' THEN 1 ELSE 0 END) AS denied
         FROM audit_logs
         WHERE created_at >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(sinceIso)
      .all<{ day: string; allowed: number | null; denied: number | null }>(),
    db
      .prepare(
        `SELECT client_id, client_name,
                COUNT(*) AS total,
                SUM(CASE WHEN decision = 'allowed' THEN 1 ELSE 0 END) AS allowed,
                SUM(CASE WHEN decision != 'allowed' THEN 1 ELSE 0 END) AS denied
         FROM audit_logs
         WHERE created_at >= ?
         GROUP BY client_id, client_name
         ORDER BY total DESC
         LIMIT 10`,
      )
      .bind(sinceIso)
      .all<{
        client_id: string;
        client_name: string;
        total: number;
        allowed: number | null;
        denied: number | null;
      }>(),
    db
      .prepare(
        `SELECT id, slug, name, service, use_count, last_used_at
         FROM secrets
         ORDER BY use_count DESC, updated_at DESC
         LIMIT 10`,
      )
      .all<{
        id: string;
        slug: string;
        name: string;
        service: string;
        use_count: number;
        last_used_at: string | null;
      }>(),
    db
      .prepare(
        `SELECT id, slug, name, service, last_used_at, created_at
         FROM secrets
         WHERE is_enabled = 1
           AND ((last_used_at IS NOT NULL AND last_used_at < ?)
                OR (last_used_at IS NULL AND created_at < ?))
         ORDER BY COALESCE(last_used_at, created_at) ASC
         LIMIT 20`,
      )
      .bind(staleCutoffIso, staleCutoffIso)
      .all<{
        id: string;
        slug: string;
        name: string;
        service: string;
        last_used_at: string | null;
        created_at: string;
      }>(),
    db
      .prepare(
        `SELECT id, slug, name, service, expires_at
         FROM secrets
         WHERE is_enabled = 1 AND expires_at IS NOT NULL AND expires_at <= ?
         ORDER BY expires_at ASC
         LIMIT 20`,
      )
      .bind(soonIso)
      .all<{
        id: string;
        slug: string;
        name: string;
        service: string;
        expires_at: string;
      }>(),
  ]);

  const byDay = new Map<string, { allowed: number; denied: number }>();
  for (const row of dailyRows.results) {
    byDay.set(row.day, {
      allowed: Number(row.allowed ?? 0),
      denied: Number(row.denied ?? 0),
    });
  }

  const dailySeries: DashboardStatsResponse["dailySeries"] = [];
  for (let i = clampedDays - 1; i >= 0; i--) {
    const dayKey = new Date(nowMs - i * 86_400_000).toISOString().slice(0, 10);
    const entry = byDay.get(dayKey);
    dailySeries.push({
      date: dayKey,
      allowed: entry?.allowed ?? 0,
      denied: entry?.denied ?? 0,
    });
  }

  return {
    summary: {
      totalSecrets: Number(secretCounts?.total ?? 0),
      enabledSecrets: Number(secretCounts?.enabled ?? 0),
      totalFolders: Number(folderCount?.cnt ?? 0),
      activeClients: Number(clientCount?.cnt ?? 0),
      totalCalls: Number(auditTotals?.total ?? 0),
      allowedCalls: Number(auditTotals?.allowed ?? 0),
      deniedCalls: Number(auditTotals?.denied ?? 0),
      previousTotalCalls: Number(prevAuditTotals?.total ?? 0),
      previousAllowedCalls: Number(prevAuditTotals?.allowed ?? 0),
      previousDeniedCalls: Number(prevAuditTotals?.denied ?? 0),
      expiringSoonCount: Number(secretCounts?.expiring_soon ?? 0),
    },
    dailySeries,
    clientBreakdown: clientRows.results.map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      callCount: Number(r.total),
      allowedCount: Number(r.allowed ?? 0),
      deniedCount: Number(r.denied ?? 0),
    })),
    topSecrets: topSecretRows.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      service: r.service,
      useCount: Number(r.use_count),
      lastUsedAt: r.last_used_at,
    })),
    staleSecrets: staleRows.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      service: r.service,
      lastUsedAt: r.last_used_at,
      createdAt: r.created_at,
    })),
    expiringSoonSecrets: expiringRows.results.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      service: r.service,
      expiresAt: r.expires_at,
    })),
  };
}

import { afterEach, describe, expect, it } from "vitest";
import {
  createFolder,
  createSecret,
  deleteFolder,
  deleteSecret,
  getDashboardStats,
  getSecretByIdOrSlug,
  insertAuditLog,
  listFolders,
  listSecrets,
  purgeExpiredAuditLogs,
  queryAuditLogs,
  recordSecretRead,
  updateClientPolicy,
  updateFolder,
  updateSecret,
  upsertClientPolicy,
} from "../src/lib/db";
import { canAccessSecret, evaluateSecretRead, filterAccessibleSecrets } from "../src/mcp/policy";
import { createWorkerTestHarness } from "./miniflare-env";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

describe("D1 repository & folder/secret ACL", () => {
  it("manages folders, uncategorizes secrets on folder delete, and prunes client policies", async () => {
    const h = await createWorkerTestHarness();
    cleanups.push(h.close);
    const now = "2026-11-26T00:00:00.000Z";

    const folder = await createFolder(h.env.DB, {
      id: "fld_cf",
      slug: "cloudflare",
      name: "Cloudflare",
      description: "CF tokens",
      color: "amber",
      sortOrder: 1,
      now,
    });
    expect(folder.secretCount).toBe(0);

    const updatedFolder = await updateFolder(h.env.DB, "fld_cf", {
      name: "CF Prod",
      now,
    });
    expect(updatedFolder?.name).toBe("CF Prod");

    const secret1 = await createSecret(h.env.DB, {
      id: "sec_1",
      folderId: "fld_cf",
      slug: "cf-dns",
      name: "CF DNS",
      service: "cloudflare",
      description: "DNS read",
      tags: ["dns", "ro"],
      metadata: { account_id: "acc1" },
      maskedPreview: "cfut...1234",
      ciphertext: "cipher1",
      iv: "iv1",
      isEnabled: true,
      expiresAt: "2026-12-05T00:00:00.000Z",
      now,
    });
    const secret2 = await createSecret(h.env.DB, {
      id: "sec_2",
      folderId: null,
      slug: "gh-pat",
      name: "GitHub PAT",
      service: "github",
      description: "Repo read",
      tags: ["git"],
      metadata: {},
      maskedPreview: "ghp_...9999",
      ciphertext: "cipher2",
      iv: "iv2",
      isEnabled: true,
      expiresAt: null,
      now,
    });
    expect(secret1.folderId).toBe("fld_cf");
    expect(secret2.folderId).toBeNull();

    const foldersAfter = await listFolders(h.env.DB);
    expect(foldersAfter[0]?.secretCount).toBe(1);

    expect(await listSecrets(h.env.DB, { folderId: "__uncategorized__" })).toHaveLength(1);
    expect(await listSecrets(h.env.DB, { folderId: "fld_cf" })).toHaveLength(1);
    expect(await listSecrets(h.env.DB, { service: "github" })).toHaveLength(1);
    expect(await listSecrets(h.env.DB, { tag: "dns" })).toHaveLength(1);
    expect(await listSecrets(h.env.DB, { q: "CF DNS" })).toHaveLength(1);

    const bySlug = await getSecretByIdOrSlug(h.env.DB, "cf-dns");
    expect(bySlug?.id).toBe("sec_1");

    await recordSecretRead(h.env.DB, "sec_1", now);
    const updatedSecret = await updateSecret(h.env.DB, "sec_1", {
      name: "CF DNS Updated",
      now,
    });
    expect(updatedSecret?.name).toBe("CF DNS Updated");
    expect(updatedSecret?.useCount).toBe(1);

    await upsertClientPolicy(h.env.DB, {
      clientId: "cli_1",
      displayName: "Gemini",
      registrationType: "dcr",
      allowAll: false,
      allowedFolderIds: ["fld_cf"],
      allowedSecretIds: ["sec_2"],
      allowPlaintextRead: true,
      status: "active",
      now,
    });

    // Deleting folder sets sec_1.folder_id = NULL and prunes fld_cf from cli_1
    expect(await deleteFolder(h.env.DB, "fld_cf")).toBe(true);
    const sec1After = await getSecretByIdOrSlug(h.env.DB, "sec_1");
    expect(sec1After?.folderId).toBeNull();

    const deletedSec2 = await deleteSecret(h.env.DB, "sec_2");
    expect(deletedSec2).toBe(true);

    const policyAfter = await updateClientPolicy(h.env.DB, "cli_1", { now });
    expect(policyAfter?.allowedFolderIds).toEqual([]);
    expect(policyAfter?.allowedSecretIds).toEqual([]);
  });

  it("purges audit logs older than 90 days and computes dashboard stats", async () => {
    const h = await createWorkerTestHarness();
    cleanups.push(h.close);

    const nowMs = Date.parse("2026-11-26T12:00:00.000Z");
    const oldDate = new Date(nowMs - 95 * 86_400_000).toISOString();
    const recentDate = new Date(nowMs - 2 * 86_400_000).toISOString();

    await createSecret(h.env.DB, {
      id: "sec_stale",
      folderId: null,
      slug: "stale-key",
      name: "Stale Key",
      service: "openai",
      description: "",
      tags: [],
      metadata: {},
      maskedPreview: "sk-1...2345",
      ciphertext: "c",
      iv: "i",
      isEnabled: true,
      expiresAt: new Date(nowMs + 5 * 86_400_000).toISOString(),
      now: oldDate,
    });

    await upsertClientPolicy(h.env.DB, {
      clientId: "cli_stats",
      displayName: "Stats Client",
      registrationType: "bot_token",
      tokenHash: "hash_stats",
      tokenPreview: "sq_live_xxx...1234",
      allowAll: true,
      allowedFolderIds: [],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "active",
      now: recentDate,
    });

    await insertAuditLog(h.env.DB, {
      clientId: "cli_stats",
      clientName: "Stats Client",
      toolName: "get_secret",
      secretId: "sec_stale",
      secretSlug: "stale-key",
      reason: "old run",
      decision: "allowed",
      createdAt: oldDate,
    });
    await insertAuditLog(h.env.DB, {
      clientId: "cli_stats",
      clientName: "Stats Client",
      toolName: "get_secret",
      secretId: "sec_stale",
      secretSlug: "stale-key",
      reason: "recent deny",
      decision: "denied",
      errorCode: "ACCESS_DENIED",
      createdAt: recentDate,
    });

    const purged = await purgeExpiredAuditLogs(h.env.DB, 90, nowMs);
    expect(purged).toBe(1);

    const logs = await queryAuditLogs(h.env.DB, { decision: "denied" });
    expect(logs.total).toBe(1);
    expect(logs.items[0]?.reason).toBe("recent deny");

    const stats = await getDashboardStats(h.env.DB, 7, nowMs);
    expect(stats.summary.totalSecrets).toBe(1);
    expect(stats.summary.activeClients).toBe(1);
    expect(stats.summary.deniedCalls).toBe(1);
    expect(stats.summary.expiringSoonCount).toBe(1);
    expect(stats.dailySeries).toHaveLength(7);
    expect(stats.staleSecrets).toHaveLength(1);
    expect(stats.expiringSoonSecrets).toHaveLength(1);
  });

  it("evaluates folder, single-secret, allowAll, disabled, expired, and metadata-only ACLs", () => {
    const basePolicy = {
      clientId: "c1",
      displayName: "C1",
      registrationType: "dcr" as const,
      tokenPreview: null,
      allowAll: false,
      allowedFolderIds: ["fld_1"],
      allowedSecretIds: ["sec_2"],
      allowPlaintextRead: true,
      status: "active" as const,
      expiresAt: null,
      userAgentHint: null,
      lastUsedAt: null,
      callCount: 0,
      createdAt: "",
      updatedAt: "",
    };

    const sInFolder = {
      id: "sec_1",
      folderId: "fld_1",
      folderName: "F1",
      folderSlug: "f1",
      slug: "s1",
      name: "S1",
      service: "cf",
      description: "",
      tags: ["t1"],
      metadata: {},
      maskedPreview: "••••",
      keyVersion: 1,
      isEnabled: true,
      expiresAt: null,
      lastUsedAt: null,
      useCount: 0,
      createdAt: "",
      updatedAt: "",
    };
    const sDirect = {
      ...sInFolder,
      id: "sec_2",
      folderId: null,
      folderName: null,
      folderSlug: null,
      slug: "s2",
    };
    const sDenied = { ...sInFolder, id: "sec_3", folderId: "fld_other", slug: "s3" };

    expect(canAccessSecret(basePolicy, sInFolder)).toBe(true);
    expect(canAccessSecret(basePolicy, sDirect)).toBe(true);
    expect(canAccessSecret(basePolicy, sDenied)).toBe(false);
    expect(canAccessSecret({ ...basePolicy, allowAll: true }, sDenied)).toBe(true);

    expect(
      filterAccessibleSecrets(basePolicy, [sInFolder, sDirect, sDenied], { folder: "f1" }),
    ).toHaveLength(1);

    const nowIso = "2026-11-26T00:00:00.000Z";
    expect(evaluateSecretRead(null, sInFolder, true, nowIso)).toMatchObject({
      ok: false,
      errorCode: "CLIENT_NOT_AUTHORIZED",
    });
    expect(
      evaluateSecretRead({ ...basePolicy, status: "suspended" }, sInFolder, true, nowIso),
    ).toMatchObject({
      ok: false,
      errorCode: "CLIENT_INACTIVE",
    });
    expect(evaluateSecretRead(basePolicy, null, true, nowIso)).toMatchObject({
      ok: false,
      decision: "not_found",
    });
    expect(evaluateSecretRead(basePolicy, sDenied, true, nowIso)).toMatchObject({
      ok: false,
      decision: "denied",
    });
    expect(
      evaluateSecretRead({ ...basePolicy, allowPlaintextRead: false }, sInFolder, true, nowIso),
    ).toMatchObject({
      ok: false,
      errorCode: "PLAINTEXT_READ_DISABLED",
    });
    expect(
      evaluateSecretRead(basePolicy, { ...sInFolder, isEnabled: false }, true, nowIso),
    ).toMatchObject({
      ok: false,
      decision: "disabled",
    });
    expect(
      evaluateSecretRead(
        basePolicy,
        { ...sInFolder, expiresAt: "2026-11-20T00:00:00.000Z" },
        true,
        nowIso,
      ),
    ).toMatchObject({
      ok: false,
      decision: "expired",
    });
    expect(
      evaluateSecretRead(
        basePolicy,
        { ...sInFolder, expiresAt: "2026-11-26T07:00:00+08:00" },
        true,
        nowIso,
      ),
    ).toMatchObject({
      ok: false,
      decision: "expired",
    });
    expect(evaluateSecretRead(basePolicy, sInFolder, true, nowIso)).toEqual({ ok: true });
  });
});

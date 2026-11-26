import { describe, expect, it } from "vitest";
import { getUserDisplay } from "@/lib/user-display";
import { APP_VERSION } from "@/lib/version";
import { buildDailyChartData, computeAllowRate } from "@/models/dashboard";
import {
  formatDateTime,
  formatShortDate,
  getAuditDecisionMeta,
  getClientStatusMeta,
  getExpiryBadge,
  getRegistrationTypeLabel,
  resolveFolderTagColor,
  summarizeClientScope,
} from "@/models/format";
import type { ClientPolicyItem, DashboardStats } from "@/models/types";
import {
  isValidSlug,
  parseMetadataJson,
  parseTagsInput,
  slugifyName,
  validateClientForm,
  validateFolderForm,
  validateSecretForm,
} from "@/models/validators";

describe("lib helpers", () => {
  it("formats user display with author profile, email, and fallback", () => {
    expect(
      getUserDisplay({
        email: "nocoo@hexly.ai",
        name: "Nocoo",
        avatar: "https://lizheng.blog/avatar/nocoo.png",
      }),
    ).toEqual({
      name: "Nocoo",
      email: "nocoo@hexly.ai",
      initial: "N",
      avatar: "https://lizheng.blog/avatar/nocoo.png",
    });
    expect(getUserDisplay({ email: "lizheng@lizheng.me", name: null, avatar: null })).toEqual({
      name: "lizheng",
      email: "lizheng@lizheng.me",
      initial: "L",
      avatar: null,
    });
    expect(getUserDisplay(undefined)).toEqual({
      name: "管理员",
      email: "",
      initial: "S",
      avatar: null,
    });
    expect(getUserDisplay({ email: "", name: "", avatar: "" })).toEqual({
      name: "管理员",
      email: "",
      initial: "S",
      avatar: null,
    });
  });

  it("exposes package version", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("validators", () => {
  it("validates and normalizes slugs", () => {
    expect(isValidSlug("cf-dns-read")).toBe(true);
    expect(isValidSlug("A")).toBe(false);
    expect(isValidSlug("-bad")).toBe(false);
    expect(slugifyName("Cloudflare DNS Token!")).toBe("cloudflare-dns-token");
  });

  it("parses comma/newline tags deduplicated and capped", () => {
    expect(parseTagsInput("dev, prod，DEV\nops, ")).toEqual(["dev", "prod", "ops"]);
  });

  it("parses metadata json objects and rejects invalid shapes", () => {
    expect(parseMetadataJson("")).toEqual({ ok: true, value: {} });
    expect(parseMetadataJson('{"region":"us","port":443,"tls":true}')).toEqual({
      ok: true,
      value: { region: "us", port: "443", tls: "true" },
    });
    expect(parseMetadataJson("not json").ok).toBe(false);
    expect(parseMetadataJson("[]").ok).toBe(false);
    expect(parseMetadataJson('{"nested":{"a":1}}').ok).toBe(false);
  });

  it("validates folder, secret, and client forms", () => {
    expect(validateFolderForm({ name: "", slug: "ok" })).toBe("请输入文件夹名称");
    expect(validateFolderForm({ name: "Ok", slug: "!" })).toContain("Slug");
    expect(validateFolderForm({ name: "Ok", slug: "ok-dir" })).toBeNull();

    expect(
      validateSecretForm({
        name: "",
        slug: "s1",
        service: "gh",
        value: "v",
        isEdit: false,
        metadataRaw: "{}",
      }),
    ).toBe("请输入密钥名称");
    expect(
      validateSecretForm({
        name: "Key",
        slug: "!",
        service: "gh",
        value: "v",
        isEdit: false,
        metadataRaw: "{}",
      }),
    ).toContain("Slug");
    expect(
      validateSecretForm({
        name: "Key",
        slug: "gh-key",
        service: "",
        value: "v",
        isEdit: false,
        metadataRaw: "{}",
      }),
    ).toContain("归属服务");
    expect(
      validateSecretForm({
        name: "Key",
        slug: "gh-key",
        service: "gh",
        value: "",
        isEdit: false,
        metadataRaw: "{}",
      }),
    ).toBe("请输入密钥明文值");
    expect(
      validateSecretForm({
        name: "Key",
        slug: "gh-key",
        service: "gh",
        value: "",
        isEdit: true,
        metadataRaw: "bad",
      }),
    ).toContain("JSON");
    expect(
      validateSecretForm({
        name: "Key",
        slug: "gh-key",
        service: "gh",
        value: "",
        isEdit: true,
        metadataRaw: "{}",
      }),
    ).toBeNull();

    expect(validateClientForm({ type: "bot_token", displayName: "", redirectUrisRaw: "" })).toBe(
      "请输入消费方名称",
    );
    expect(
      validateClientForm({ type: "bot_token", displayName: "Bot", redirectUrisRaw: "" }),
    ).toBeNull();
    expect(
      validateClientForm({ type: "static_oauth", displayName: "App", redirectUrisRaw: "" }),
    ).toContain("回调地址");
    expect(
      validateClientForm({
        type: "static_oauth",
        displayName: "App",
        redirectUrisRaw: "not-a-url",
      }),
    ).toContain("无效的回调 URL");
    expect(
      validateClientForm({
        type: "static_oauth",
        displayName: "App",
        redirectUrisRaw: "https://oauth-redirect.googleusercontent.com/r/abc",
      }),
    ).toBeNull();
  });
});

describe("formatters & dashboard transforms", () => {
  it("resolves folder colors and dates", () => {
    expect(resolveFolderTagColor("teal")).toBe("teal");
    expect(resolveFolderTagColor("unknown")).toBe("amber");
    expect(formatDateTime(null)).toBe("从未");
    expect(formatDateTime("bad-date")).toBe("bad-date");
    expect(formatDateTime("2026-11-26T08:00:00.000Z")).toContain("26");
    expect(formatShortDate("2026-11-26")).toBe("11-26");
    expect(formatShortDate("short")).toBe("short");
  });

  it("computes expiry badges", () => {
    const now = Date.parse("2026-11-26T00:00:00Z");
    expect(getExpiryBadge(null, now)).toBeNull();
    expect(getExpiryBadge("bad", now)).toBeNull();
    expect(getExpiryBadge("2026-11-20T00:00:00Z", now)).toEqual({
      label: "已过期",
      tone: "danger",
    });
    expect(getExpiryBadge("2026-12-06T00:00:00Z", now)).toEqual({
      label: "10 天后过期",
      tone: "warning",
    });
    expect(getExpiryBadge("2027-05-01T00:00:00Z", now)).toEqual({
      label: "有效期至 2027-05-01",
      tone: "neutral",
    });
  });

  it("maps client status, registration type, audit decision, and scope summary", () => {
    expect(getClientStatusMeta("active").tone).toBe("success");
    expect(getClientStatusMeta("suspended").tone).toBe("warning");
    expect(getClientStatusMeta("revoked").tone).toBe("danger");

    expect(getRegistrationTypeLabel("dcr")).toBe("OAuth DCR");
    expect(getRegistrationTypeLabel("static_oauth")).toBe("静态 OAuth");
    expect(getRegistrationTypeLabel("bot_token")).toBe("Bot Token");

    expect(getAuditDecisionMeta("allowed").label).toBe("放行");
    expect(getAuditDecisionMeta("denied").label).toBe("拒绝");
    expect(getAuditDecisionMeta("expired").label).toBe("已过期");
    expect(getAuditDecisionMeta("disabled").label).toBe("已停用");
    expect(getAuditDecisionMeta("not_found").label).toBe("未找到");

    const basePolicy: ClientPolicyItem = {
      clientId: "c1",
      displayName: "Gemini",
      registrationType: "dcr",
      tokenPreview: null,
      allowAll: false,
      allowedFolderIds: [],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "active",
      expiresAt: null,
      userAgentHint: null,
      lastUsedAt: null,
      callCount: 0,
      createdAt: "",
      updatedAt: "",
    };
    expect(summarizeClientScope({ ...basePolicy, allowAll: true })).toBe("全部密钥（*）");
    expect(
      summarizeClientScope({ ...basePolicy, allowedFolderIds: ["f1"], allowedSecretIds: ["s1"] }),
    ).toBe("1 个文件夹 + 1 个单独密钥");
    expect(summarizeClientScope(basePolicy)).toBe("未分配权限");
  });

  it("transforms dashboard stats", () => {
    expect(buildDailyChartData(null)).toEqual([]);
    expect(computeAllowRate(0, 0)).toBe("—");
    expect(computeAllowRate(3, 4)).toBe("75%");

    const stats: DashboardStats = {
      summary: {
        totalSecrets: 2,
        enabledSecrets: 2,
        totalFolders: 1,
        activeClients: 1,
        totalCalls: 10,
        allowedCalls: 8,
        deniedCalls: 2,
        expiringSoonCount: 0,
      },
      dailySeries: [{ date: "2026-11-26", allowed: 8, denied: 2 }],
      clientBreakdown: [],
      topSecrets: [],
      staleSecrets: [],
      expiringSoonSecrets: [],
    };
    expect(buildDailyChartData(stats)).toEqual([
      { date: "2026-11-26", label: "11-26", allowed: 8, denied: 2 },
    ]);
  });
});

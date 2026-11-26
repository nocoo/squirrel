import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/data/api";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ClientPolicyItem, FolderItem, SecretItem } from "@/models/types";
import { useAuditLogsViewModel } from "@/viewmodels/useAuditLogsViewModel";
import { useAuthorizeViewModel } from "@/viewmodels/useAuthorizeViewModel";
import { useClientsViewModel } from "@/viewmodels/useClientsViewModel";
import { useDashboardViewModel } from "@/viewmodels/useDashboardViewModel";
import { useMe } from "@/viewmodels/useMe";
import { useSecretsViewModel } from "@/viewmodels/useSecretsViewModel";

vi.mock("@/data/api", () => ({
  api: {
    getMe: vi.fn(),
    getStats: vi.fn(),
    listFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    listSecrets: vi.fn(),
    createSecret: vi.fn(),
    updateSecret: vi.fn(),
    revealSecret: vi.fn(),
    deleteSecret: vi.fn(),
    listClients: vi.fn(),
    createBotClient: vi.fn(),
    createStaticOAuthClient: vi.fn(),
    updateClient: vi.fn(),
    rotateBotToken: vi.fn(),
    revokeClient: vi.fn(),
    listLogs: vi.fn(),
    getAuthTx: vi.fn(),
    decideAuthTx: vi.fn(),
  },
}));

const FOLDER_1: FolderItem = {
  id: "fld_1",
  slug: "cf",
  name: "Cloudflare",
  description: "",
  color: "amber",
  sortOrder: 0,
  secretCount: 1,
  createdAt: "2026-11-26T00:00:00Z",
  updatedAt: "2026-11-26T00:00:00Z",
};

const SECRET_1: SecretItem = {
  id: "sec_1",
  folderId: "fld_1",
  folderName: "Cloudflare",
  folderSlug: "cf",
  slug: "cf-dns",
  name: "CF DNS",
  service: "cloudflare",
  description: "DNS read token",
  tags: ["dns"],
  metadata: {},
  maskedPreview: "cfut...1234",
  keyVersion: 1,
  isEnabled: true,
  expiresAt: null,
  lastUsedAt: null,
  useCount: 0,
  createdAt: "2026-11-26T00:00:00Z",
  updatedAt: "2026-11-26T00:00:00Z",
};

const SECRET_2: SecretItem = {
  ...SECRET_1,
  id: "sec_2",
  folderId: null,
  folderName: null,
  folderSlug: null,
  slug: "gh-pat",
  name: "GitHub PAT",
  service: "github",
  description: "GitHub personal access token",
  tags: ["git"],
};

const CLIENT_1: ClientPolicyItem = {
  clientId: "bot_1",
  displayName: "Agent 1",
  registrationType: "bot_token",
  tokenPreview: "sq_live_abc...1234",
  allowAll: false,
  allowedFolderIds: ["fld_1"],
  allowedSecretIds: [],
  allowPlaintextRead: true,
  status: "active",
  expiresAt: null,
  userAgentHint: null,
  lastUsedAt: null,
  callCount: 2,
  createdAt: "2026-11-26T00:00:00Z",
  updatedAt: "2026-11-26T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useIsMobile", () => {
  it("tracks matchMedia changes", () => {
    let listener: (() => void) | undefined;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: (_: string, cb: () => void) => {
          listener = cb;
        },
        removeEventListener: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(listener).toBeDefined();
  });
});

describe("useMe & useDashboardViewModel", () => {
  it("loads current admin user and handles error fallback", async () => {
    vi.mocked(api.getMe).mockResolvedValueOnce({
      email: "admin@hexly.ai",
      environment: "production",
    });
    const { result } = renderHook(() => useMe());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.email).toBe("admin@hexly.ai");

    vi.mocked(api.getMe).mockRejectedValueOnce(new Error("fail"));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.data).toBeNull();
  });

  it("loads dashboard stats and switches day windows", async () => {
    vi.mocked(api.getStats).mockResolvedValue({
      summary: {
        totalSecrets: 1,
        enabledSecrets: 1,
        totalFolders: 1,
        activeClients: 1,
        totalCalls: 4,
        allowedCalls: 3,
        deniedCalls: 1,
        expiringSoonCount: 0,
      },
      dailySeries: [{ date: "2026-11-26", allowed: 3, denied: 1 }],
      clientBreakdown: [],
      topSecrets: [],
      staleSecrets: [],
      expiringSoonSecrets: [],
    });

    const { result } = renderHook(() => useDashboardViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allowRate).toBe("75%");
    expect(result.current.chartData).toHaveLength(1);

    act(() => result.current.setDays(30));
    await waitFor(() => expect(api.getStats).toHaveBeenCalledWith(30));

    vi.mocked(api.getStats).mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.error).toBe("boom");
  });
});

describe("useSecretsViewModel", () => {
  it("filters by folder, service, and search query and runs CRUD", async () => {
    vi.mocked(api.listFolders).mockResolvedValue({ items: [FOLDER_1] });
    vi.mocked(api.listSecrets).mockResolvedValue({ items: [SECRET_1, SECRET_2] });
    vi.mocked(api.createFolder).mockResolvedValue({ item: FOLDER_1 });
    vi.mocked(api.updateFolder).mockResolvedValue({ item: FOLDER_1 });
    vi.mocked(api.deleteFolder).mockResolvedValue({ ok: true });
    vi.mocked(api.createSecret).mockResolvedValue({ item: SECRET_1 });
    vi.mocked(api.updateSecret).mockResolvedValue({ item: SECRET_1 });
    vi.mocked(api.deleteSecret).mockResolvedValue({ ok: true });
    vi.mocked(api.revealSecret).mockResolvedValue({
      id: "sec_1",
      slug: "cf-dns",
      value: "plain-secret",
    });

    const { result } = renderHook(() => useSecretsViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filteredSecrets).toHaveLength(2);
    expect(result.current.uncategorizedCount).toBe(1);
    expect(result.current.services).toEqual(["cloudflare", "github"]);

    act(() => result.current.setSelectedFolder("__uncategorized__"));
    expect(result.current.filteredSecrets.map((s) => s.id)).toEqual(["sec_2"]);

    act(() => result.current.setSelectedFolder("fld_1"));
    expect(result.current.filteredSecrets.map((s) => s.id)).toEqual(["sec_1"]);

    act(() => {
      result.current.setSelectedFolder("all");
      result.current.setServiceFilter("github");
    });
    expect(result.current.filteredSecrets.map((s) => s.id)).toEqual(["sec_2"]);

    act(() => {
      result.current.setServiceFilter("all");
      result.current.setSearchQuery("dns");
    });
    expect(result.current.filteredSecrets.map((s) => s.id)).toEqual(["sec_1"]);

    await act(async () => {
      await result.current.saveFolder(null, {
        slug: "new-f",
        name: "New",
        description: "",
        color: "amber",
        sortOrder: 0,
      });
      await result.current.saveFolder("fld_1", {
        slug: "cf",
        name: "CF2",
        description: "",
        color: "blue",
        sortOrder: 1,
      });
      await result.current.saveSecret(null, {
        folderId: "fld_1",
        slug: "s-new",
        name: "New",
        service: "cf",
        value: "v",
        description: "",
        tags: [],
        metadata: {},
        isEnabled: true,
        expiresAt: null,
      });
      await result.current.saveSecret("sec_1", {
        folderId: "fld_1",
        slug: "cf-dns",
        name: "CF DNS 2",
        service: "cloudflare",
        description: "",
        tags: [],
        metadata: {},
        isEnabled: true,
        expiresAt: null,
      });
      await result.current.revealSecret(SECRET_1);
    });
    expect(result.current.revealed?.value).toBe("plain-secret");

    act(() => result.current.clearRevealed());
    expect(result.current.revealed).toBeNull();

    act(() => result.current.setSelectedFolder("fld_1"));
    await act(async () => {
      await result.current.removeFolder("fld_1");
      await result.current.removeSecret("sec_1");
    });
    expect(result.current.selectedFolder).toBe("all");
  });
});

describe("useClientsViewModel & useAuditLogsViewModel & useAuthorizeViewModel", () => {
  it("manages bot tokens, static oauth clients, rotation, and revocation", async () => {
    vi.mocked(api.listClients).mockResolvedValue({ items: [CLIENT_1] });
    vi.mocked(api.listFolders).mockResolvedValue({ items: [FOLDER_1] });
    vi.mocked(api.listSecrets).mockResolvedValue({ items: [SECRET_1] });
    vi.mocked(api.createBotClient).mockResolvedValue({ item: CLIENT_1, token: "sq_live_test" });
    vi.mocked(api.createStaticOAuthClient).mockResolvedValue({
      item: { ...CLIENT_1, registrationType: "static_oauth" },
      oauthCredentials: {
        clientId: "cid_1",
        clientSecret: "csec_1",
        redirectUris: ["https://oauth-redirect.googleusercontent.com/r/1"],
      },
    });
    vi.mocked(api.updateClient).mockResolvedValue({ item: CLIENT_1 });
    vi.mocked(api.rotateBotToken).mockResolvedValue({ item: CLIENT_1, token: "sq_live_rot" });
    vi.mocked(api.revokeClient).mockResolvedValue({ item: { ...CLIENT_1, status: "revoked" } });

    const { result } = renderHook(() => useClientsViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createBotToken({
        displayName: "Agent 1",
        allowAll: false,
        allowedFolderIds: ["fld_1"],
        allowedSecretIds: [],
        allowPlaintextRead: true,
        expiresAt: null,
      });
    });
    expect(result.current.issuedCredential?.kind).toBe("bot_token");

    await act(async () => {
      await result.current.createStaticOAuth({
        displayName: "Gemini",
        redirectUris: ["https://oauth-redirect.googleusercontent.com/r/1"],
        tokenEndpointAuthMethod: "client_secret_post",
        allowAll: true,
        allowedFolderIds: [],
        allowedSecretIds: [],
        allowPlaintextRead: true,
      });
    });
    expect(result.current.issuedCredential?.kind).toBe("static_oauth");

    await act(async () => {
      await result.current.updatePolicy("bot_1", { status: "suspended" });
      await result.current.rotateBotToken(CLIENT_1);
      await result.current.revokeClient("bot_1");
    });
    act(() => result.current.clearIssuedCredential());
    expect(result.current.issuedCredential).toBeNull();
  });

  it("loads and filters paginated audit logs", async () => {
    vi.mocked(api.listClients).mockResolvedValue({ items: [CLIENT_1] });
    vi.mocked(api.listLogs).mockResolvedValue({
      items: [
        {
          id: 1,
          clientId: "bot_1",
          clientName: "Agent 1",
          toolName: "get_secret",
          secretId: "sec_1",
          secretSlug: "cf-dns",
          reason: "check dns",
          decision: "allowed",
          errorCode: null,
          userAgent: "curl",
          cfRay: null,
          latencyMs: 12,
          createdAt: "2026-11-26T00:00:00Z",
        },
      ],
      total: 30,
    });

    const { result } = renderHook(() => useAuditLogsViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalPages).toBe(2);

    act(() => result.current.setPage(2));
    act(() => result.current.setClientFilter("bot_1"));
    expect(result.current.page).toBe(1);
    act(() => result.current.setDecisionFilter("denied"));
    act(() => result.current.setToolFilter("get_secret"));
    await waitFor(() => expect(api.listLogs).toHaveBeenCalled());
  });

  it("loads authorize transaction and submits approve/deny", async () => {
    const missing = renderHook(() => useAuthorizeViewModel(null));
    await waitFor(() => expect(missing.result.current.loading).toBe(false));
    expect(missing.result.current.error).toContain("tx");

    vi.mocked(api.getAuthTx).mockResolvedValue({
      txId: "tx_1",
      csrfToken: "csrf_1",
      clientId: "cid_1",
      clientName: "Gemini",
      redirectUri: "https://oauth-redirect.googleusercontent.com/r/1",
      redirectHost: "oauth-redirect.googleusercontent.com",
      redirectIsLoopback: false,
      scopes: ["secrets:list", "secrets:read"],
      existingPolicy: null,
      folders: [FOLDER_1],
      secrets: [],
    });
    vi.mocked(api.decideAuthTx).mockResolvedValue({
      redirectTo: "https://oauth-redirect.googleusercontent.com/r/1?code=abc",
    });

    const { result } = renderHook(() => useAuthorizeViewModel("tx_1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.displayName).toBe("Gemini");

    let redirect: string | null = null;
    await act(async () => {
      redirect = await result.current.approve();
    });
    expect(redirect).toContain("code=abc");

    await act(async () => {
      redirect = await result.current.deny();
    });
    expect(api.decideAuthTx).toHaveBeenLastCalledWith("tx_1", {
      decision: "deny",
      csrfToken: "csrf_1",
    });
  });
});

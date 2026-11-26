import type {
  AdminUserInfo,
  AuditLogItem,
  AuthTxDetail,
  ClientPolicyItem,
  ClientStatus,
  DashboardStats,
  FolderItem,
  SecretItem,
} from "@/models/types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      if (data.error) message = data.error;
      else if (data.message) message = data.message;
    } catch {
      // Ignore parse error on non-JSON failures.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getMe: () => requestJson<AdminUserInfo>("/api/admin/me"),

  getStats: (days = 7) => requestJson<DashboardStats>(`/api/admin/stats?days=${days}`),

  listFolders: () => requestJson<{ items: FolderItem[] }>("/api/admin/folders"),

  createFolder: (payload: {
    slug: string;
    name: string;
    description: string;
    color: string;
    sortOrder: number;
  }) =>
    requestJson<{ item: FolderItem }>("/api/admin/folders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateFolder: (
    id: string,
    payload: Partial<{
      slug: string;
      name: string;
      description: string;
      color: string;
      sortOrder: number;
    }>,
  ) =>
    requestJson<{ item: FolderItem }>(`/api/admin/folders/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteFolder: (id: string) =>
    requestJson<{ ok: true }>(`/api/admin/folders/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listSecrets: (params?: { folderId?: string; service?: string; tag?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.folderId) query.set("folderId", params.folderId);
    if (params?.service) query.set("service", params.service);
    if (params?.tag) query.set("tag", params.tag);
    if (params?.q) query.set("q", params.q);
    const qs = query.toString();
    return requestJson<{ items: SecretItem[] }>(`/api/admin/secrets${qs ? `?${qs}` : ""}`);
  },

  createSecret: (payload: {
    folderId: string | null;
    slug: string;
    name: string;
    service: string;
    value: string;
    description: string;
    tags: string[];
    metadata: Record<string, string>;
    isEnabled: boolean;
    expiresAt: string | null;
  }) =>
    requestJson<{ item: SecretItem }>("/api/admin/secrets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSecret: (
    id: string,
    payload: Partial<{
      folderId: string | null;
      slug: string;
      name: string;
      service: string;
      value: string;
      description: string;
      tags: string[];
      metadata: Record<string, string>;
      isEnabled: boolean;
      expiresAt: string | null;
    }>,
  ) =>
    requestJson<{ item: SecretItem }>(`/api/admin/secrets/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  revealSecret: (id: string) =>
    requestJson<{ id: string; slug: string; value: string }>(
      `/api/admin/secrets/${encodeURIComponent(id)}/reveal`,
    ),

  deleteSecret: (id: string) =>
    requestJson<{ ok: true }>(`/api/admin/secrets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listClients: () => requestJson<{ items: ClientPolicyItem[] }>("/api/admin/clients"),

  createBotClient: (payload: {
    displayName: string;
    allowAll: boolean;
    allowedFolderIds: string[];
    allowedSecretIds: string[];
    allowPlaintextRead: boolean;
    expiresAt: string | null;
  }) =>
    requestJson<{ item: ClientPolicyItem; token: string }>("/api/admin/clients", {
      method: "POST",
      body: JSON.stringify({ type: "bot_token", ...payload }),
    }),

  createStaticOAuthClient: (payload: {
    displayName: string;
    redirectUris: string[];
    tokenEndpointAuthMethod: "client_secret_post" | "client_secret_basic" | "none";
    allowAll: boolean;
    allowedFolderIds: string[];
    allowedSecretIds: string[];
    allowPlaintextRead: boolean;
  }) =>
    requestJson<{
      item: ClientPolicyItem;
      oauthCredentials: {
        clientId: string;
        clientSecret: string | null;
        redirectUris: string[];
      };
    }>("/api/admin/clients", {
      method: "POST",
      body: JSON.stringify({ type: "static_oauth", ...payload }),
    }),

  updateClient: (
    clientId: string,
    payload: Partial<{
      displayName: string;
      allowAll: boolean;
      allowedFolderIds: string[];
      allowedSecretIds: string[];
      allowPlaintextRead: boolean;
      status: ClientStatus;
      expiresAt: string | null;
    }>,
  ) =>
    requestJson<{ item: ClientPolicyItem }>(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  rotateBotToken: (clientId: string) =>
    requestJson<{ item: ClientPolicyItem; token: string }>(
      `/api/admin/clients/${encodeURIComponent(clientId)}/rotate-token`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  revokeClient: (clientId: string) =>
    requestJson<{ item: ClientPolicyItem }>(
      `/api/admin/clients/${encodeURIComponent(clientId)}/revoke`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  listLogs: (params?: {
    clientId?: string;
    secretId?: string;
    toolName?: string;
    decision?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.clientId) query.set("clientId", params.clientId);
    if (params?.secretId) query.set("secretId", params.secretId);
    if (params?.toolName) query.set("toolName", params.toolName);
    if (params?.decision) query.set("decision", params.decision);
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    const qs = query.toString();
    return requestJson<{ items: AuditLogItem[]; total: number }>(
      `/api/admin/logs${qs ? `?${qs}` : ""}`,
    );
  },

  getAuthTx: (txId: string) =>
    requestJson<AuthTxDetail>(`/api/admin/oauth/tx/${encodeURIComponent(txId)}`),

  decideAuthTx: (
    txId: string,
    payload:
      | {
          decision: "approve";
          csrfToken: string;
          displayName: string;
          allowAll: boolean;
          allowedFolderIds: string[];
          allowedSecretIds: string[];
          allowPlaintextRead: boolean;
        }
      | {
          decision: "deny";
          csrfToken: string;
        },
  ) =>
    requestJson<{ redirectTo: string }>(
      `/api/admin/oauth/tx/${encodeURIComponent(txId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
};

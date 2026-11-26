export type RegistrationType = "dcr" | "static_oauth" | "bot_token";
export type ClientStatus = "active" | "suspended" | "revoked";
export type AuditDecision = "allowed" | "denied" | "not_found" | "expired" | "disabled";

export interface AdminUserInfo {
  email: string;
  name: string | null;
  avatar: string | null;
  environment: string;
}

export interface FolderItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  secretCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SecretItem {
  id: string;
  folderId: string | null;
  folderName: string | null;
  folderSlug: string | null;
  slug: string;
  name: string;
  service: string;
  description: string;
  tags: string[];
  metadata: Record<string, string>;
  maskedPreview: string;
  keyVersion: number;
  isEnabled: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPolicyItem {
  clientId: string;
  displayName: string;
  registrationType: RegistrationType;
  tokenPreview: string | null;
  allowAll: boolean;
  allowedFolderIds: string[];
  allowedSecretIds: string[];
  allowPlaintextRead: boolean;
  status: ClientStatus;
  expiresAt: string | null;
  userAgentHint: string | null;
  lastUsedAt: string | null;
  callCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  id: number;
  clientId: string;
  clientName: string;
  toolName: string;
  secretId: string | null;
  secretSlug: string | null;
  reason: string | null;
  decision: AuditDecision;
  errorCode: string | null;
  userAgent: string | null;
  cfRay: string | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface DashboardStats {
  summary: {
    totalSecrets: number;
    enabledSecrets: number;
    totalFolders: number;
    activeClients: number;
    totalCalls: number;
    allowedCalls: number;
    deniedCalls: number;
    expiringSoonCount: number;
  };
  dailySeries: {
    date: string;
    allowed: number;
    denied: number;
  }[];
  clientBreakdown: {
    clientId: string;
    clientName: string;
    callCount: number;
    allowedCount: number;
    deniedCount: number;
  }[];
  topSecrets: {
    id: string;
    slug: string;
    name: string;
    service: string;
    useCount: number;
    lastUsedAt: string | null;
  }[];
  staleSecrets: {
    id: string;
    slug: string;
    name: string;
    service: string;
    lastUsedAt: string | null;
    createdAt: string;
  }[];
  expiringSoonSecrets: {
    id: string;
    slug: string;
    name: string;
    service: string;
    expiresAt: string;
  }[];
}

export interface AuthTxDetail {
  txId: string;
  csrfToken: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  scopes: string[];
  existingPolicy: ClientPolicyItem | null;
  folders: FolderItem[];
  secrets: {
    id: string;
    slug: string;
    name: string;
    service: string;
    folderId: string | null;
    folderName: string | null;
  }[];
}

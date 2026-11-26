import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export type RegistrationType = "dcr" | "static_oauth" | "bot_token";
export type ClientStatus = "active" | "suspended" | "revoked";
export type AuditDecision = "allowed" | "denied" | "not_found" | "expired" | "disabled";

export interface WorkerBindings {
  ASSETS: Fetcher;
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  ENVIRONMENT: string;
  PUBLIC_ORIGIN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD?: string;
  LOCAL_USER_EMAIL?: string;
  ALLOWED_REDIRECT_HOSTS: string;
  MASTER_KEY?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
}

export interface FolderRecord {
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

export interface SecretSummary {
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

export interface SecretWithCiphertext extends SecretSummary {
  ciphertext: string;
  iv: string;
}

export interface ClientPolicyRecord {
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

export interface AuditLogRecord {
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

export interface OAuthProps {
  clientId: string;
  email: string;
  authMethod?: "oauth" | "bot_token";
}

export interface McpCallerContext {
  clientId: string;
  clientName: string;
  scopes: string[];
  authMethod: "oauth" | "bot_token";
  userAgent: string | null;
  cfRay: string | null;
}

export interface AuthTransactionRecord {
  oauthRequest: AuthRequest;
  csrfToken: string;
  clientName: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  createdAt: string;
}

export interface DashboardStatsResponse {
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

-- 1. 文件夹表（用于密钥归类与按文件夹批量授权）
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'amber',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_sort_order ON folders(sort_order, name);

-- 2. 密钥主表
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  service TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  masked_preview TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secrets_folder_id ON secrets(folder_id);
CREATE INDEX IF NOT EXISTS idx_secrets_service ON secrets(service);
CREATE INDEX IF NOT EXISTS idx_secrets_enabled ON secrets(is_enabled);

-- 3. 消费方策略表（覆盖 DCR OAuth / 静态 OAuth / 无头 Bot Bearer Token）
CREATE TABLE IF NOT EXISTS oauth_client_policies (
  client_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  registration_type TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  token_preview TEXT,
  allow_all INTEGER NOT NULL DEFAULT 0,
  allowed_folder_ids_json TEXT NOT NULL DEFAULT '[]',
  allowed_secret_ids_json TEXT NOT NULL DEFAULT '[]',
  allow_plaintext_read INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  user_agent_hint TEXT,
  last_used_at TEXT,
  call_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_token_hash ON oauth_client_policies(token_hash);
CREATE INDEX IF NOT EXISTS idx_policies_status ON oauth_client_policies(status);

-- 4. 审计日志表（Cron 每日自动清理 90 天前记录）
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  secret_id TEXT,
  secret_slug TEXT,
  reason TEXT,
  decision TEXT NOT NULL,
  error_code TEXT,
  user_agent TEXT,
  cf_ray TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_client_id ON audit_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_secret_id ON audit_logs(secret_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_decision ON audit_logs(decision, created_at DESC);

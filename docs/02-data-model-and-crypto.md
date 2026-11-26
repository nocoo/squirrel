# 02. 数据模型、加密与授权策略

## 1. 存储分工

- **Cloudflare KV（`OAUTH_KV`）**：由 `@cloudflare/workers-oauth-provider` 管理 OAuth 客户端元数据、Authorization Code、Access Token、Refresh Token 与 Grant；同时暂存 `/authorize` 授权事务 `auth_tx:<txId>`（TTL 300 秒），规避超长 `state` 写入 Cookie 触发 4KB 截断。
- **Cloudflare D1（`DB` / `squirrel-db`）**：持久化文件夹、密文密钥、消费方策略与审计日志（迁移文件：[0001_init.sql](file:///Users/nocoo/workspace/personal/squirrel/worker/migrations/0001_init.sql)）。

## 2. D1 表结构概览

| 表名                    | 用途               | 关键字段与约束                                                                                                                                                                               |
| :---------------------- | :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `folders`               | 密钥文件夹分类     | `id` (`fld_...`)、`slug` (UNIQUE)、`name`、`color`、`sort_order`                                                                                                                             |
| `secrets`               | 加密后的密钥主表   | `id` (`sec_...`)、`folder_id` (`REFERENCES folders(id) ON DELETE SET NULL`)、`slug` (UNIQUE)、`masked_preview`、`ciphertext`、`iv`、`use_count`、`expires_at`                                |
| `oauth_client_policies` | 消费方隔离策略     | `client_id`、`registration_type` (`dcr` \| `static_oauth` \| `bot_token`)、`token_hash`、`allow_all`、`allowed_folder_ids_json`、`allowed_secret_ids_json`、`allow_plaintext_read`、`status` |
| `audit_logs`            | 调用与查看审计流水 | `client_id`、`client_name`、`tool_name`、`secret_id`、`reason`、`decision`、`error_code`、`cf_ray`、`latency_ms`、`created_at`                                                               |

删除文件夹时，其内部密钥通过外键 `ON DELETE SET NULL` 自动转为未分类；同时后端会清理 `oauth_client_policies.allowed_folder_ids_json` 中对应的失效文件夹引用（删除密钥同理清理 `allowed_secret_ids_json`）。

## 3. Web Crypto AES-256-GCM 加密

实现位于 [crypto.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/lib/crypto.ts)：

1. 生产环境必须通过 `wrangler secret put MASTER_KEY` 注入 32 字节 Base64 主密钥（`openssl rand -base64 32`）；非生产环境未配置时自动派生本地开发密钥，禁止将任何密钥字面量提交到仓库。
2. 每次写入或轮换密钥均生成新的 12 字节随机 IV，并将 `secret.id` 作为 AES-GCM 的 AAD（Additional Authenticated Data）绑定，防止密文被跨行替换。
3. 无头 Bot Token 采用 `sq_live_` + 32 字节 Base64URL 随机串生成，服务端仅存储 `SHA-256` 十六进制哈希与前 11/后 4 位掩码，明文仅在创建或轮换时返回一次。

## 4. 文件夹与单密钥细粒度 ACL

实现位于 [policy.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/mcp/policy.ts)：

1. 消费方策略须为 `status === "active"` 且未过 `expires_at`。
2. 对任意密钥 `secret`，可访问判定为：
   - `policy.allowAll === true`，**或**
   - `secret.folderId !== null && policy.allowedFolderIds.includes(secret.folderId)`（文件夹内新增密钥自动继承权限），**或**
   - `policy.allowedSecretIds.includes(secret.id)`（单独密钥白名单）。
3. 读取明文 `get_secret` 时额外校验 `policy.allowPlaintextRead === true`、OAuth `secrets:read` Scope、`secret.isEnabled === true` 及未过 `secret.expiresAt`。

## 5. 审计日志 90 天自动清理

`wrangler.jsonc` 配置每日定时触发器 `0 3 * * *`（UTC 03:00），在 [index.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/index.ts) 的 `scheduled()` 中并行执行 `purgeExpiredAuditLogs(env.DB, 90)` 与 `provider.purgeExpiredData(env)`。

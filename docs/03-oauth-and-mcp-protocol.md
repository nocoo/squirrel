# 03. OAuth 2.1、Bot Token 与 MCP 协议规范

## 1. OAuth 2.1 与 Gemini 兼容性实现

1. **未认证 Challenge**：`POST /mcp` 未携带合法 Bearer Token 时返回 `401 Unauthorized` 与 `WWW-Authenticate: Bearer ...`（不返回 302 CF Access 登录页）。
2. **双路径 RFC 9728 发现**：`GET /.well-known/oauth-protected-resource` 与 `GET /.well-known/oauth-protected-resource/mcp` 均返回 `200 OK` 及完全一致的 `resource`（`${origin}/mcp`）。
3. **RFC 8414 元数据**：`GET /.well-known/oauth-authorization-server` 声明 `code`、`S256` PKCE、`authorization_response_iss_parameter_supported: true`、`registration_endpoint` 与 `revocation_endpoint`。
4. **DCR 白名单防护**：`POST /oauth/register` 通过 [dcr-guard.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/auth/dcr-guard.ts) 校验 `redirect_uris`，放行 `ALLOWED_REDIRECT_HOSTS`（默认覆盖 `oauth-redirect.googleusercontent.com`、`oauth-redirect-sandbox.googleusercontent.com`、`oauth-redirect-test.googleusercontent.com`、`vertexaisearch.cloud.google.com`、`gemini.google.com`、`localhost`、`127.0.0.1`），非回环地址强制要求 `https:`，并拒绝 `#fragment` 与 userinfo。
5. **超长 `state` 事务化授权页**：`GET /authorize` 解析请求并将完整 `AuthRequest`（兼容 3000+ 字符 `state`）写入 `OAUTH_KV`（`auth_tx:<txId>`，TTL 300 秒），302 重定向到 `/authorize?tx=<txId>` 由 React SPA 渲染授权同意页；提交批准后回跳原 `redirect_uri` 并完整附带 `state` 与 `iss`。
6. **无状态 Streamable HTTP**：`POST /mcp` 使用 `@modelcontextprotocol/sdk` 的 `WebStandardStreamableHTTPServerTransport`（`sessionIdGenerator: undefined, enableJsonResponse: true`），支持 `2025-03-26` ~ `2025-11-25`；`GET /mcp` 显式返回 `405 Method Not Allowed`（`Allow: POST`）。
7. **Token 吊销同步**：支持向 `/oauth/revoke`（或 `/oauth/token` RFC 7009 形态）发起吊销请求，在作废 KV Token/Grant 的同时将 D1 `oauth_client_policies.status` 同步置为 `revoked`。

## 2. 无头 Bot / Agent Bearer Token

对于无浏览器交互的自动化 Agent、Bot 或脚本，可在后台签发 `sq_live_...` 长效 Bearer Token：

- 请求 `POST /mcp` 时附带 `Authorization: Bearer sq_live_...`。
- `OAuthProvider` 的 `resolveExternalToken` 回调将请求交由 [bot-token.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/auth/bot-token.ts) 验证哈希、状态与过期时间，并与 OAuth 客户端共享同一套文件夹/单密钥 ACL 与审计流水。

## 3. MCP Tools 清单

实现位于 [server.ts](file:///Users/nocoo/workspace/personal/squirrel/worker/src/mcp/server.ts)，全部工具均标记 `readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true`、`openWorldHint: false`：

| 工具名           | 所需 Scope     | 说明                                                                                    |
| :--------------- | :------------- | :-------------------------------------------------------------------------------------- |
| `whoami`         | `secrets:list` | 返回当前消费方身份、授权文件夹/单密钥范围与可访问密钥数量                               |
| `list_secrets`   | `secrets:list` | 列举当前消费方可见的密钥元数据（支持按 `service`、`tag`、`folder` 筛选，不含明文）      |
| `search_secrets` | `secrets:list` | 按关键词模糊匹配名称、Slug、服务、文件夹、标签与用途描述（不含明文）                    |
| `get_secret`     | `secrets:read` | 按 `secret_id` 或 `slug` 解密返回明文与非敏感元数据，强制要求填写 `reason` 写入审计日志 |

若 OAuth Token 仅含 `secrets:list` 而调用 `get_secret`，Worker 返回 HTTP `403` 与 `WWW-Authenticate: Bearer error="insufficient_scope", scope="secrets:read"`；若因 D1 权限被回收或密钥停用/过期导致不可访问，则返回 JSON-RPC `result.isError: true` 并记录对应审计决策。

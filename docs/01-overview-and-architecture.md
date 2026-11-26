# 01. 概览与系统架构

Squirrel（松鼠）是部署在 **Cloudflare Workers** 上的个人级 API Key / Token 托管服务，通过标准 **MCP（Streamable HTTP）+ OAuth 2.1 + 无头 Bot Bearer Token** 向 Gemini、Claude Code、Cursor 及自建自动化 Agent 按需分发低敏凭证。

## 1. 核心定位与安全边界

- **托管对象**：第三方开发 API Key、只读访问 Token、Webhook Secret、非敏感扩展配置（如 Base URL、Account ID）。不建议存放网银主密码、助记词或根账号永久 Master Key。
- **管理面与数据面分离**：
  - **管理面**（`/admin/*`、`/api/admin/*`、`/authorize`）：由 **Cloudflare Access** 保护，Worker 内使用 `jose` 校验 `Cf-Access-Jwt-Assertion` 签名与 `aud`/`iss` Claim，变更接口校验同源 `Origin` 并返回 `Cache-Control: no-store`。
  - **数据面**（`/.well-known/*`、`/oauth/*`、`/mcp`）：对公网放行，由 `@cloudflare/workers-oauth-provider` 与静态 Bot Token 校验把关。
- **秒级策略生效**：无论客户端使用 1 小时有效期的 OAuth Access Token 还是长效 Bot Bearer Token，每次 `/mcp` 调用均实时读取 D1 `oauth_client_policies` 表，后台改权、暂停或吊销即刻生效。

## 2. Cloudflare 路由拓扑

```text
Cloudflare Edge / Access
  ├─ Protect: /admin/*, /api/admin/*, /authorize
  └─ Bypass:  /.well-known/*, /oauth/*, /mcp, /api/live, /
        │
        ▼
Cloudflare Worker (squirrel-web)
  ├─ OAuth 2.1 Provider (@cloudflare/workers-oauth-provider)
  │    ├─ RFC 9728 / RFC 8414 元数据发现
  │    ├─ /oauth/register (DCR + redirect_uri 白名单校验)
  │    ├─ /oauth/token & /oauth/revoke (PKCE S256 / Refresh 宽容轮换 / 吊销)
  │    └─ resolveExternalToken -> sq_live_* 无头 Bot Token 校验
  ├─ Stateless MCP Server (/mcp, @modelcontextprotocol/sdk)
  │    ├─ whoami / list_secrets / search_secrets / get_secret
  │    └─ 文件夹 + 单密钥细粒度 ACL + D1 审计日志
  ├─ Hono Admin & Authorize API (/api/admin/*, /authorize)
  ├─ Workers Static Assets (React 19 + Vite 8 + @nocoo/basalt 3.6)
  └─ Cron Trigger (0 3 * * * UTC): 清理 90 天前审计日志 & 过期 KV
```

## 3. 工程结构

| 目录                 | 职责                                                                                               |
| :------------------- | :------------------------------------------------------------------------------------------------- |
| `src/`               | 前端管理后台与 OAuth 授权同意页（MVVM：`models` / `viewmodels` / `data` / `pages` / `components`） |
| `worker/src/`        | Cloudflare Worker 入口、OAuth/Bot 鉴权、MCP 工具服务、Admin REST API、加解密与 D1 访问             |
| `worker/migrations/` | D1 SQL 迁移脚本（`0001_init.sql`）                                                                 |
| `tests/api/`         | L3 隔离 Miniflare HTTP 集成测试（完整 OAuth 2.1 + PKCE + Bot Token + MCP）                         |
| `e2e/bdd/`           | L4 Playwright 浏览器端到端测试（独立本地端口 `27067`）                                             |
| `scripts/`           | 本地测试服务、生产发布校验与部署脚本                                                               |
| `docs/`              | 分层编号设计文档（中文）                                                                           |

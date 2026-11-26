# Squirrel 设计文档索引

本目录按从总体到细节的顺序组织 Squirrel（松鼠）个人密钥托管 MCP 服务的架构与工程文档：

1. [01. 概览与系统架构](01-overview-and-architecture.md) — 系统定位、安全边界、Cloudflare 路由拓扑与目录分工
2. [02. 数据模型、加密与授权策略](02-data-model-and-crypto.md) — D1/KV 存储设计、AES-256-GCM 加密、文件夹/单密钥 ACL 与 90 天日志自动清理
3. [03. OAuth 2.1、Bot Token 与 MCP 协议规范](03-oauth-and-mcp-protocol.md) — Gemini 接入约束、OAuth 2.1 端点、无头 Bot Bearer Token 与 MCP Tools 定义
4. [04. 管理后台与 API 规范](04-admin-ui-and-api.md) — `@nocoo/basalt` 管理后台界面与 `/api/admin/*` 接口契约
5. [05. 本地开发、测试与部署运维](05-development-and-operations.md) — Caddy 本地开发、12 槽位质量体系、Worker Secrets 与 CF Access 上线步骤

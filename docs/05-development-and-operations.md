# 05. 本地开发、测试与部署运维

## 1. 本机开发与 Caddy 域名

本机开发环境通过 `system0-machine-caddy` 绑定 HTTPS 开发域名 `https://squirrel.dev.hexly.ai`（反向代理到 `127.0.0.1:7067`）：

```sh
bun install --frozen-lockfile
bun run db:migrate      # 初始化本地 D1 表结构 (--local --env local)
bun run dev             # 启动 Vite + Worker 本地服务 (https://squirrel.dev.hexly.ai)
```

- 每日开发使用 `.wrangler/state`，默认本地身份 `developer@example.test`。
- 禁止在未授权时使用生产环境或本地状态运行测试。

## 2. 质量体系（对接 `base-ci v2026.19`）

项目采用 12 槽位质量门禁（定义见 [.github/workflows/quality-slots.yml](file:///Users/nocoo/workspace/personal/squirrel/.github/workflows/quality-slots.yml)）：

| 槽位            | 命令                                                             | 说明                                                                           |
| :-------------- | :--------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| S1 Types        | `bun run typecheck`                                              | 生成 `worker-configuration.d.ts` 并对 App / Worker / Tests 执行 `tsc --noEmit` |
| S2 Lint         | `bun run lint`                                                   | Biome check-only，0 error / 0 warning                                          |
| S3 Workflow     | `actionlint -shellcheck= -pyflakes=`                             | 校验 GitHub Actions 与 40 位 SHA 钉选                                          |
| G1 Secrets      | `gitleaks dir . --no-banner --redact --log-level error`          | 敏感信息扫描                                                                   |
| G2 Dependencies | `osv-scanner scan --lockfile=bun.lock --config=osv-scanner.toml` | 依赖漏洞扫描                                                                   |
| B1 Build        | `bun run build`                                                  | Vite + Cloudflare Worker 单次构建并上传 `b1-build`                             |
| L1 Unit         | `bun run test:unit:coverage`                                     | `vitest` (`v8`) >= 80% 覆盖率（Models / ViewModels / Lib / Hooks）             |
| L2 Runtime      | `bun run test:worker`                                            | 真实 Miniflare D1/KV 绑定单元测试（>= 80% `worker/src` 覆盖率）                |
| L3 Integration  | `bun run test:api`                                               | 隔离 Miniflare HTTP 协议与 OAuth/Bot/MCP 集成测试                              |
| L4 E2E          | `bun run test:e2e:bdd`                                           | Playwright 浏览器关键路径验证（隔离端口 `27067`）                              |
| P1 Package      | `bunx wrangler deploy --dry-run`                                 | Worker 打包与部署预检                                                          |
| Z1 Gate         | CI 汇总门禁                                                      | 收集 S1–P1 结果，`quality / Z1: Gate` 作为分支保护必需检查                     |

## 3. 生产环境资源与部署清单

- **Worker**：`squirrel-web`（自定义域名 `squirrel.hexly.ai`，`workers_dev: false`）
- **D1 数据库**：`squirrel-db`（ID: `47120ece-5886-42a6-9382-72b3d907fcda`）
- **KV 命名空间**：`squirrel-oauth-kv`（ID: `574ee7f1a325425d82da165712ea7427`）
- **必需 Worker Secrets 与 Access AUD**：
  - `CF_ACCESS_AUD` 配置在 [wrangler.jsonc](file:///Users/nocoo/workspace/personal/squirrel/wrangler.jsonc) 的 `vars` 中。
  - `MASTER_KEY` 需在首次上线前手工注入生产 Worker，不提交进 Git：

  ```sh
  openssl rand -base64 32 | bunx wrangler secret put MASTER_KEY --name squirrel-web
  ```
- **Cloudflare Access 策略**（Zero Trust -> Self-hosted Application）：
  - 仅保护三条路径：`squirrel.hexly.ai/admin*`、`squirrel.hexly.ai/api/admin*`、`squirrel.hexly.ai/authorize*`。
  - 严禁覆盖 `/.well-known/*`、`/oauth/*`、`/mcp` 与 `/api/live`。
- **GitHub Actions 自动发布**：`main` 分支 CI 绿色后自动触发 [.github/workflows/release.yml](file:///Users/nocoo/workspace/personal/squirrel/.github/workflows/release.yml) 执行 D1 迁移、Worker 部署与 [verify-deployment.ts](file:///Users/nocoo/workspace/personal/squirrel/scripts/verify-deployment.ts) 线上验收（需在 GitHub `production` 环境配置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`）。
- **Gemini 协议专项冒烟**：`bash test/verify-gemini.sh https://squirrel.hexly.ai`。

# Squirrel

Personal API key and token vault MCP server on Cloudflare Workers (`ts-worker-web`: Vite React SPA + single Worker / D1 / KV).
Docs: [README.md](README.md) · [Docs Index](docs/README.md) · [Architecture](docs/01-overview-and-architecture.md) · [Data & Crypto](docs/02-data-model-and-crypto.md) · [OAuth & MCP](docs/03-oauth-and-mcp-protocol.md) · [Ops](docs/05-development-and-operations.md)

## Commands

Layout: UI views in `src/{pages,components}/`, MVVM domain in `src/{models,viewmodels,data,hooks}/`, Worker in `worker/src/`, SQL in `worker/migrations/`.

Run from root with Bun 1.4.0 and Node.js 22.23+ (CI: 26.12.1); root `package.json` + `bun.lock` are the sole dependency source. Local bindings and `developer@example.test` live in `wrangler.jsonc`.

```sh
bun install --frozen-lockfile
bun run db:migrate            # local D1 migrations (--local --env local)
bun run dev                   # http://127.0.0.1:7067 (https://squirrel.dev.hexly.ai)
bun run typecheck             # S1: wrangler types + app/worker/tests tsc
bun run lint                  # S2: Biome check-only (0 warnings)
bun run test:unit:coverage    # L1: >=80% app coverage (v8)
bun run test:worker           # L2: >=80% worker/src coverage (Miniflare D1/KV)
bun run test:api              # L3: isolated Miniflare HTTP OAuth/Bot/MCP/Admin tests
bun run test:e2e:bdd          # L4: Playwright browser journeys (port 27067)
bun run build                 # B1: Vite client + Worker bundle
bun run deploy:check          # P1: build + wrangler deploy --dry-run
```

## Invariants

- Product UI and `docs/` are Chinese; use `@nocoo/basalt@^3.6.0` controls, amber primary override, L0–L3 matte surfaces, and `ChartFrame` + Recharts.
- Management plane (`/admin*`, `/api/admin*`, `/authorize*`) is protected by Cloudflare Access (`Cf-Access-Jwt-Assertion` verified with `jose` JWKS) + `Origin` check on mutations + `Cache-Control: no-store`.
- Protocol plane (`/.well-known/*`, `/oauth/*`, `/mcp`, `/api/live`) MUST stay bypassed by CF Access. Unauthenticated `POST /mcp` returns `401` + `WWW-Authenticate`; `GET /mcp` returns `405`.
- Secret plaintext is encrypted with AES-256-GCM (`MASTER_KEY` Worker secret in prod, `secret.id` as AAD, random 12-byte IV); bot tokens (`sq_live_...`) are stored only as SHA-256 hashes.
- Keep `LOCAL_USER_EMAIL` empty and `workers_dev: false` / `preview_urls: false` in `wrangler.jsonc` production config; retain `squirrel-db` (`47120ece-5886-42a6-9382-72b3d907fcda`) and `OAUTH_KV` (`574ee7f1a325425d82da165712ea7427`).
- Cron trigger (`0 3 * * *`) runs `purgeExpiredAuditLogs(env.DB, 90)` and `provider.purgeExpiredData(env)`.
- `main` push CI success triggers prod deploy (`.github/workflows/release.yml`). Manual deploys, prod D1 migrations, and secret rotation require explicit authorization.

## Quality & Local Gates

Follows `system1-quality` and `nocoo/base-ci@e5876a604547b1ddb0916f16dd841a4f832609a0` (`v2026.20`); `quality / Z1: Gate` is the required status check on `main`.

- **Coverage**: `L1` enforces >=80% on `src/{models,viewmodels,lib,hooks}` (`vitest.config.ts`); `L2` enforces >=80% on `worker/src` (`worker/vitest.config.ts`).
- **Local hooks**: `.husky/pre-commit` runs staged `gitleaks` (`G1`) then parallel `S1`/`S2`/`L1`/`L2`/`L3` inside a `git checkout-index` snapshot; `.husky/pre-push` runs `B1`/`S2`/`L1`/`L2`/`L3`/`typecheck:worker`/`G2` (`osv-scanner`).

## Resources & Isolation

| Lane       | Endpoint / State                                                             | Boundary                                                      |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Dev        | `http://127.0.0.1:7067` (`https://squirrel.dev.hexly.ai`), `.wrangler/state` | Daily local D1/KV (`developer@example.test`)                  |
| API (`L3`) | Ephemeral loopback port, temp dir + `_test_marker`                           | Bundled Miniflare Worker; marker verified on setup and close  |
| E2E (`L4`) | `http://127.0.0.1:27067`, temp `SQUIRREL_TEST_STATE` (`test@example.test`)   | Marker verified before startup; server reuse disabled         |
| Prod       | `https://squirrel.hexly.ai`, Worker `squirrel-web`, D1 `squirrel-db`         | Read-only checks unless deployment or migration is authorized |

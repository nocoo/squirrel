import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createAccessJwtKit, TEST_AUD } from "./access-jwt.js";

const migrationSql = readFileSync(
  fileURLToPath(new URL("../../worker/migrations/0001_init.sql", import.meta.url)),
  "utf8",
);
const workerEntry = fileURLToPath(new URL("../../worker/src/index.ts", import.meta.url));
const prebuiltWorkerPath = fileURLToPath(
  new URL("../../dist/squirrel_web/index.js", import.meta.url),
);
const MARKER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const serveAssetsStub = async () =>
  new Response("<html><body>squirrel-spa</body></html>", {
    headers: { "content-type": "text/html" },
  });

export type WorkerVars = {
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  LOCAL_USER_EMAIL?: string;
  ALLOWED_REDIRECT_HOSTS?: string;
  MASTER_KEY?: string;
};

async function applySql(db: D1Database, sql: string): Promise<void> {
  const statements = sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.exec(`${stmt};`);
  }
}

export async function installTestMarker(
  db: D1Database,
  runId: string = crypto.randomUUID(),
): Promise<string> {
  if (!MARKER_ID.test(runId)) throw new Error("invalid test marker id");
  await db.exec("CREATE TABLE IF NOT EXISTS _test_marker (id TEXT NOT NULL);");
  await db.prepare("INSERT INTO _test_marker (id) VALUES (?)").bind(runId).run();
  return runId;
}

export async function assertTestMarker(db: D1Database, runId: string): Promise<void> {
  const row = await db.prepare("SELECT id FROM _test_marker").first<{ id: string }>();
  if (row?.id !== runId) {
    throw new Error("Test database marker mismatch");
  }
}

let bundledScript: Promise<string> | undefined;
let jwtKit: ReturnType<typeof createAccessJwtKit> | undefined;

export function accessJwtKit() {
  jwtKit ??= createAccessJwtKit();
  return jwtKit;
}

async function bundleWorker(): Promise<string> {
  if (process.env.SQUIRREL_PREBUILT_WORKER === "1") {
    if (!existsSync(prebuiltWorkerPath)) {
      throw new Error(
        `SQUIRREL_PREBUILT_WORKER=1 requires prebuilt worker at ${prebuiltWorkerPath} (run bun run build first)`,
      );
    }
    return readFileSync(prebuiltWorkerPath, "utf8");
  }
  bundledScript ??= esbuild
    .build({
      entryPoints: [workerEntry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      conditions: ["workerd", "worker", "browser"],
      mainFields: ["module", "main"],
      external: ["cloudflare:*", "node:*"],
      loader: { ".json": "json" },
    })
    .then((result) => {
      const file = result.outputFiles[0];
      if (!file) throw new Error("esbuild produced no worker bundle");
      return file.text;
    });
  return bundledScript;
}

export type IsolatedWorker = {
  origin: string;
  db: D1Database;
  marker: string;
  close: () => Promise<void>;
};

export async function createIsolatedWorker(vars: WorkerVars = {}): Promise<IsolatedWorker> {
  const persistDir = mkdtempSync(join(tmpdir(), "squirrel-api-"));
  const kit = accessJwtKit();
  const script = await bundleWorker();
  let mf: Miniflare | undefined;

  try {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        host: "127.0.0.1",
        port: 0,
        logRequests: false,
        isolatedResourcePersistencePath: persistDir,
        modules: true,
        script,
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        kvNamespaces: ["OAUTH_KV"],
        bindings: {
          ENVIRONMENT: "test",
          PUBLIC_ORIGIN: "",
          CF_ACCESS_TEAM_DOMAIN: "nocoo",
          CF_ACCESS_AUD: TEST_AUD,
          LOCAL_USER_EMAIL: "test@example.test",
          ALLOWED_REDIRECT_HOSTS: "oauth-redirect.googleusercontent.com,localhost,127.0.0.1",
          ...vars,
        },
        serviceBindings: {
          ASSETS: serveAssetsStub,
        },
        outboundService: async (request) => {
          const url = String(request.url);
          if (url.includes("/cdn-cgi/access/certs")) {
            return kit.jwksResponse();
          }
          if (url.startsWith("https://lizheng.blog/api/authors/profile")) {
            const hash = new URL(url).searchParams.get("hash");
            const nocooHash = createHash("sha256").update("nocoo@hexly.ai").digest("hex");
            if (hash === nocooHash) {
              return Response.json({
                name: "Nocoo",
                avatar: "https://lizheng.blog/avatar/nocoo.png",
              });
            }
            return new Response("Not Found", { status: 404 });
          }
          return new Response("blocked", { status: 503 });
        },
      }),
    );

    const origin = (await mf.ready).origin;
    const db = (await mf.getD1Database("DB")) as unknown as D1Database;
    await applySql(db, migrationSql);
    const marker = await installTestMarker(db);
    const miniflare = mf;

    return {
      origin,
      db,
      marker,
      close: async () => {
        try {
          await assertTestMarker(db, marker);
        } finally {
          await miniflare.dispose();
          rmSync(persistDir, { recursive: true, force: true });
        }
      },
    };
  } catch (err) {
    await mf?.dispose().catch(() => undefined);
    rmSync(persistDir, { recursive: true, force: true });
    throw err;
  }
}

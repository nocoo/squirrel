import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { WorkerBindings } from "../src/types";

const migrationSql = readFileSync(
  fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url)),
  "utf8",
);

export async function applyMigrations(db: D1Database): Promise<void> {
  const statements = migrationSql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.exec(`${stmt};`);
  }
}

export async function createWorkerTestHarness(overrides: Partial<WorkerBindings> = {}): Promise<{
  mf: Miniflare;
  env: WorkerBindings;
  close: () => Promise<void>;
}> {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ["DB"],
      kvNamespaces: ["OAUTH_KV"],
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const kv = (await mf.getKVNamespace("OAUTH_KV")) as unknown as KVNamespace;
  await applyMigrations(db);

  const env: WorkerBindings = {
    ASSETS: {
      fetch: async () => new Response("<html>spa</html>", { status: 200 }),
    } as unknown as Fetcher,
    DB: db,
    OAUTH_KV: kv,
    ENVIRONMENT: "test",
    PUBLIC_ORIGIN: "https://squirrel.test",
    CF_ACCESS_TEAM_DOMAIN: "nocoo",
    LOCAL_USER_EMAIL: "test@example.test",
    ALLOWED_REDIRECT_HOSTS:
      "oauth-redirect.googleusercontent.com,oauth-redirect-sandbox.googleusercontent.com,oauth-redirect-test.googleusercontent.com,vertexaisearch.cloud.google.com,gemini.google.com,localhost,127.0.0.1",
    ...overrides,
  };

  return {
    mf,
    env,
    close: async () => {
      await mf.dispose();
    },
  };
}

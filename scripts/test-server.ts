import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const testConfig = config.env.test;
if (
  testConfig.vars.ENVIRONMENT !== "test" ||
  testConfig.routes.length ||
  testConfig.d1_databases[0].database_id !== "test-squirrel"
) {
  throw new Error("Browser tests require isolated local bindings");
}

const state = mkdtempSync(join(tmpdir(), "squirrel-browser-"));
const marker = crypto.randomUUID();
writeFileSync(
  join(state, "marker.sql"),
  `CREATE TABLE _test_marker (id TEXT NOT NULL); INSERT INTO _test_marker VALUES ('${marker}');`,
);

const env = { ...process.env, CLOUDFLARE_ENV: "test", SQUIRREL_TEST_STATE: state };

function database(...args: string[]) {
  const result = spawnSync(
    "bun",
    ["x", "wrangler", "d1", ...args, "--local", "--env", "test", "--persist-to", state],
    { env, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function startServer() {
  if (process.env.SQUIRREL_PREBUILT_E2E === "1") {
    const prebuiltWorker = resolve("dist/squirrel_web/index.js");
    const prebuiltClientIndex = resolve("dist/client/index.html");
    if (!existsSync(prebuiltWorker) || !existsSync(prebuiltClientIndex)) {
      throw new Error(
        "SQUIRREL_PREBUILT_E2E=1 requires prebuilt B1 output in dist/ (run bun run build first)",
      );
    }
    const wranglerConfigPath = join(state, "wrangler.test.json");
    const runtimeConfig = {
      name: testConfig.name,
      main: prebuiltWorker,
      no_bundle: true,
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      workers_dev: false,
      preview_urls: false,
      routes: [],
      assets: {
        ...config.assets,
        directory: resolve("dist/client"),
      },
      vars: testConfig.vars,
      d1_databases: testConfig.d1_databases.map((db: Record<string, unknown>) => ({
        ...db,
        migrations_dir: resolve(String(db.migrations_dir ?? "worker/migrations")),
      })),
      kv_namespaces: testConfig.kv_namespaces,
    };
    writeFileSync(wranglerConfigPath, JSON.stringify(runtimeConfig, null, 2));
    const prebuiltEnv = Object.fromEntries(
      Object.entries(env).filter(([k]) => k !== "CLOUDFLARE_ENV"),
    );
    return spawn(
      "bun",
      [
        "x",
        "wrangler",
        "dev",
        "--config",
        wranglerConfigPath,
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        "27067",
        "--persist-to",
        state,
        "--show-interactive-dev-session=false",
      ],
      { env: prebuiltEnv, stdio: "inherit" },
    );
  }

  return spawn("bun", ["x", "vite", "--host", "127.0.0.1", "--port", "27067"], {
    env,
    stdio: "inherit",
  });
}

try {
  database("migrations", "apply", "DB");
  database("execute", "DB", "--file", join(state, "marker.sql"));
  const result = JSON.parse(
    database("execute", "DB", "--command", "SELECT id FROM _test_marker", "--json"),
  );
  if (result[0]?.results[0]?.id !== marker) {
    throw new Error("Test database marker mismatch");
  }

  const child = startServer();
  const stop = () => child.kill("SIGTERM");
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (value) => resolve(value ?? 0));
  });
  process.exitCode = code;
} finally {
  rmSync(state, { recursive: true, force: true });
}

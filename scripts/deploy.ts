import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

if (process.env.CLOUDFLARE_ENV || process.env.SQUIRREL_TEST_STATE) {
  throw new Error("Deploy requires the production environment");
}

if (
  config.name !== "squirrel-web" ||
  config.vars.ENVIRONMENT !== "production" ||
  config.vars.PUBLIC_ORIGIN !== "https://squirrel.hexly.ai" ||
  config.vars.LOCAL_USER_EMAIL ||
  config.vars.CF_ACCESS_TEAM_DOMAIN !== "nocoo" ||
  config.vars.CF_ACCESS_AUD !==
    "bd2de3c9093ed620bbddc709dbe628515d1c024dbbd1a73f0c2c072c1f4dbd56" ||
  config.d1_databases[0]?.database_id !== "47120ece-5886-42a6-9382-72b3d907fcda" ||
  config.kv_namespaces[0]?.id !== "574ee7f1a325425d82da165712ea7427" ||
  config.workers_dev !== false ||
  config.preview_urls !== false
) {
  throw new Error(
    "Production Worker, Access, D1, and KV configuration must match the approved deployment",
  );
}

for (const args of [
  ["run", "build"],
  ["x", "wrangler", "deploy", "--tag", `v${version}`],
]) {
  const result = spawnSync("bun", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

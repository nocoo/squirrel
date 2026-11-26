import { version } from "../package.json";

const origin = "https://squirrel.hexly.ai";

const response = await fetch(`${origin}/api/live`, {
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
if (response.status !== 200) {
  throw new Error(`Health endpoint returned ${response.status}`);
}
if (
  response.headers.get("x-content-type-options") !== "nosniff" ||
  response.headers.get("x-frame-options") !== "DENY" ||
  response.headers.get("referrer-policy") !== "no-referrer"
) {
  throw new Error("Missing expected security headers on /api/live");
}
const health = (await response.json()) as {
  status?: string;
  version?: string;
  storage?: string;
  database?: { connected?: boolean };
};
if (
  health.status !== "ok" ||
  health.version !== version ||
  health.storage !== "d1" ||
  health.database?.connected !== true
) {
  throw new Error("Deployed health, version, or D1 connectivity does not match release");
}

const mcpUnauth = await fetch(`${origin}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
if (mcpUnauth.status !== 401 || !mcpUnauth.headers.get("www-authenticate")) {
  throw new Error(`Expected /mcp 401 + WWW-Authenticate, got ${mcpUnauth.status}`);
}

const prRes = await fetch(`${origin}/.well-known/oauth-protected-resource`, {
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
if (prRes.status !== 200) {
  throw new Error(`Expected protected resource metadata 200, got ${prRes.status}`);
}

for (const path of ["/admin", "/api/admin/me", "/authorize"]) {
  const result = await fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const location = result.headers.get("location");
  if (
    result.status !== 302 ||
    !location ||
    new URL(location).hostname !== "nocoo.cloudflareaccess.com"
  ) {
    throw new Error(`Access did not protect ${path}: ${result.status}`);
  }
}

console.log(
  `Verified Squirrel v${version}: D1 connected, MCP OAuth discovery open, Access protects admin & authorize.`,
);

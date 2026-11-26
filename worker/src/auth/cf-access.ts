import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getPublicOrigin } from "../lib/env";
import type { WorkerBindings } from "../types";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const LOCAL_DEV_HOST = "squirrel.dev.hexly.ai";
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function normalizeAccessTeamOrigin(rawDomain: string): string {
  const trimmed = rawDomain.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return `https://${trimmed}.cloudflareaccess.com`;
}

function getJwks(issuerOrigin: string) {
  let jwks = jwksByIssuer.get(issuerOrigin);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuerOrigin}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuerOrigin, jwks);
  }
  return jwks;
}

export function isLocalBypassAllowed(request: Request, env: WorkerBindings): boolean {
  if (env.ENVIRONMENT !== "local" && env.ENVIRONMENT !== "test") {
    return false;
  }
  if (!env.LOCAL_USER_EMAIL?.trim()) {
    return false;
  }
  const hostname = new URL(request.url).hostname.toLowerCase();
  const peer = request.headers.get("cf-connecting-ip");
  const loopbackPeer = peer === "127.0.0.1" || peer === "::1";
  if (LOOPBACK_HOSTS.has(hostname)) {
    return !peer || loopbackPeer;
  }
  if (hostname === LOCAL_DEV_HOST && loopbackPeer) {
    return true;
  }
  return env.ENVIRONMENT === "test" && hostname === "squirrel.test" && !peer;
}

export async function verifyAccessJwt(
  assertion: string,
  env: WorkerBindings,
): Promise<{ email: string; name: string | null }> {
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!aud) {
    throw new Error("CF_ACCESS_AUD is not configured");
  }
  const issuer = normalizeAccessTeamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  const { payload } = await jwtVerify(assertion, getJwks(issuer), {
    algorithms: ["RS256"],
    issuer,
    audience: aud,
    requiredClaims: ["exp", "iat", "sub", "email"],
  });
  if (
    typeof payload.sub !== "string" ||
    !payload.sub.trim() ||
    typeof payload.email !== "string" ||
    !/^[^@\s]+@[^@\s]+$/.test(payload.email.trim())
  ) {
    throw new Error("Invalid Access identity claims");
  }
  const email = payload.email.trim().toLowerCase();
  const name =
    typeof payload.name === "string" && payload.name.trim().length > 0 ? payload.name.trim() : null;
  return { email, name };
}

export const cfAccessMiddleware = createMiddleware<{
  Bindings: WorkerBindings;
  Variables: { adminEmail: string; adminName?: string | null };
}>(async (c, next) => {
  c.header("Cache-Control", "no-store");

  const assertion = c.req.header("Cf-Access-Jwt-Assertion");
  if (!assertion) {
    if (isLocalBypassAllowed(c.req.raw, c.env)) {
      c.set("adminEmail", c.env.LOCAL_USER_EMAIL?.trim().toLowerCase() ?? "");
      c.set("adminName", null);
      return next();
    }
    return c.json({ error: "Missing Cloudflare Access JWT" }, 401);
  }

  try {
    const { email, name } = await verifyAccessJwt(assertion, c.env);
    c.set("adminEmail", email);
    c.set("adminName", name);
    return next();
  } catch {
    return c.json({ error: "Invalid Cloudflare Access JWT" }, 403);
  }
});

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const enforceOriginMiddleware = createMiddleware<{
  Bindings: WorkerBindings;
}>(async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    return next();
  }
  if (c.req.header("Sec-Fetch-Site") === "cross-site") {
    return c.json({ error: "Cross-site request blocked" }, 403);
  }
  const originHeader = c.req.header("Origin");
  if (!originHeader) {
    return c.json({ error: "Missing Origin header" }, 403);
  }
  const requestOrigin = new URL(c.req.url).origin;
  const configuredOrigin = getPublicOrigin(c.req.raw, c.env);
  if (originHeader !== requestOrigin && originHeader !== configuredOrigin) {
    return c.json({ error: "Origin mismatch" }, 403);
  }
  return next();
});

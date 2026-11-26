import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getPublicOrigin } from "../lib/env";
import type { WorkerBindings } from "../types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function normalizeAccessTeamOrigin(rawDomain: string): string {
  const trimmed = rawDomain.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return `https://${trimmed}.cloudflareaccess.com`;
}

function getJwks(issuerOrigin: string) {
  let jwks = jwksCache.get(issuerOrigin);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuerOrigin}/cdn-cgi/access/certs`));
    jwksCache.set(issuerOrigin, jwks);
  }
  return jwks;
}

export async function verifyAccessJwt(
  assertion: string,
  env: WorkerBindings,
): Promise<{ email: string }> {
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!aud) {
    throw new Error("CF_ACCESS_AUD is not configured");
  }
  const issuer = normalizeAccessTeamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  const { payload } = await jwtVerify(assertion, getJwks(issuer), {
    issuer,
    audience: aud,
  });
  const email = typeof payload.email === "string" && payload.email ? payload.email : "admin";
  return { email };
}

export const cfAccessMiddleware = createMiddleware<{
  Bindings: WorkerBindings;
  Variables: { adminEmail: string };
}>(async (c, next) => {
  c.header("Cache-Control", "no-store");

  const assertion = c.req.header("Cf-Access-Jwt-Assertion");
  if (!assertion) {
    const localEmail = c.env.LOCAL_USER_EMAIL?.trim();
    if (c.env.ENVIRONMENT !== "production" && localEmail) {
      c.set("adminEmail", localEmail);
      return next();
    }
    return c.json({ error: "Missing Cloudflare Access JWT" }, 401);
  }

  try {
    const { email } = await verifyAccessJwt(assertion, c.env);
    c.set("adminEmail", email);
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
  const originHeader = c.req.header("Origin");
  if (!originHeader) {
    return next();
  }
  const requestOrigin = new URL(c.req.url).origin;
  const configuredOrigin = getPublicOrigin(c.req.raw, c.env);
  if (originHeader !== requestOrigin && originHeader !== configuredOrigin) {
    return c.json({ error: "Origin mismatch" }, 403);
  }
  return next();
});

import type { ClientRegistrationCallbackResult } from "@cloudflare/workers-oauth-provider";
import { getAllowedRedirectHosts } from "../lib/env";
import type { WorkerBindings } from "../types";

export function validateRedirectUris(
  redirectUris: unknown,
  env: WorkerBindings,
): { ok: true; uris: string[] } | { ok: false; description: string } {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return { ok: false, description: "redirect_uris must be a non-empty array" };
  }

  const allowedHosts = getAllowedRedirectHosts(env);
  const validUris: string[] = [];

  for (const raw of redirectUris) {
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, description: "redirect_uris entries must be non-empty strings" };
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, description: `Invalid redirect_uri URL: ${raw}` };
    }

    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1";
    if (!allowedHosts.has(host)) {
      return { ok: false, description: `Disallowed redirect_uri host: ${host}` };
    }
    if (!isLoopback && parsed.protocol !== "https:") {
      return { ok: false, description: "Non-loopback redirect_uri must use HTTPS" };
    }
    if (isLoopback && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, description: "Loopback redirect_uri must use HTTP or HTTPS" };
    }
    validUris.push(parsed.toString());
  }

  return { ok: true, uris: validUris };
}

export function dcrClientRegistrationCheck(
  clientMetadata: Record<string, unknown>,
  env: WorkerBindings,
): ClientRegistrationCallbackResult | undefined {
  const result = validateRedirectUris(clientMetadata.redirect_uris, env);
  if (result.ok) {
    return undefined;
  }
  return {
    code: "invalid_redirect_uri",
    description: result.description,
    status: 400,
  };
}

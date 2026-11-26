import type { WorkerBindings } from "../types";

export async function getMasterKey(env: WorkerBindings): Promise<string> {
  const configured = env.MASTER_KEY?.trim();
  if (configured) {
    return configured;
  }
  if (env.ENVIRONMENT === "production") {
    throw new Error("MASTER_KEY secret is required in production");
  }
  const seed = new TextEncoder().encode(`squirrel-nonprod-master-key:${env.ENVIRONMENT}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
  let binary = "";
  for (let i = 0; i < digest.byteLength; i++) {
    binary += String.fromCharCode(digest[i] ?? 0);
  }
  return btoa(binary);
}

export function getPublicOrigin(request: Request, env: WorkerBindings): string {
  const configured = env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }
  return new URL(request.url).origin;
}

export function getAllowedRedirectHosts(env: WorkerBindings): Set<string> {
  return new Set(
    (env.ALLOWED_REDIRECT_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

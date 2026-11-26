import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateBotToken,
  generateId,
  maskBotToken,
  maskSecretValue,
  sha256Hex,
} from "../src/lib/crypto";
import { getAllowedRedirectHosts, getMasterKey, getPublicOrigin } from "../src/lib/env";
import type { WorkerBindings } from "../src/types";

const BASE_ENV: WorkerBindings = {
  ASSETS: {} as Fetcher,
  DB: {} as D1Database,
  OAUTH_KV: {} as KVNamespace,
  ENVIRONMENT: "test",
  PUBLIC_ORIGIN: "https://squirrel.hexly.ai/",
  CF_ACCESS_TEAM_DOMAIN: "nocoo",
  ALLOWED_REDIRECT_HOSTS: "oauth-redirect.googleusercontent.com, localhost, 127.0.0.1",
};

describe("crypto helpers", () => {
  it("encrypts and decrypts secrets with AAD binding", async () => {
    const masterKey = await getMasterKey(BASE_ENV);
    const enc = await encryptSecret("super-secret-value-1234", "sec_001", masterKey);
    const plain = await decryptSecret(enc.ciphertext, enc.iv, "sec_001", masterKey);
    expect(plain).toBe("super-secret-value-1234");

    await expect(decryptSecret(enc.ciphertext, enc.iv, "sec_002", masterKey)).rejects.toThrow();
  });

  it("rejects invalid master key length", async () => {
    const badKey = btoa("short");
    await expect(encryptSecret("abc", "sec_1", badKey)).rejects.toThrow("32 bytes");
  });

  it("masks secret values and bot tokens", () => {
    expect(maskSecretValue("12345678")).toBe("••••••••");
    expect(maskSecretValue("cfut_1234567890abcd")).toBe("cfut...abcd");
    expect(maskBotToken("sq_live_short")).toBe("sq_live_••••");
    expect(maskBotToken("sq_live_abcdefghijklmnopqrstuvwxyz")).toBe("sq_live_abc...wxyz");
  });

  it("generates unique ids, bot tokens, and sha256 hex digests", async () => {
    const id1 = generateId("sec");
    const id2 = generateId("sec");
    expect(id1).toMatch(/^sec_[0-9a-f]{20}$/);
    expect(id1).not.toBe(id2);

    const token = generateBotToken();
    expect(token.startsWith("sq_live_")).toBe(true);
    const digest = await sha256Hex(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("env helpers", () => {
  it("requires MASTER_KEY in production and derives deterministic key in non-prod", async () => {
    const prodEnv = { ...BASE_ENV, ENVIRONMENT: "production", MASTER_KEY: "" };
    await expect(getMasterKey(prodEnv)).rejects.toThrow("MASTER_KEY secret is required");

    const explicit = await getMasterKey({ ...prodEnv, MASTER_KEY: "custom-key" });
    expect(explicit).toBe("custom-key");

    const localA = await getMasterKey({ ...BASE_ENV, ENVIRONMENT: "local" });
    const localB = await getMasterKey({ ...BASE_ENV, ENVIRONMENT: "local" });
    expect(localA).toBe(localB);
  });

  it("resolves public origin and redirect host allowlist", () => {
    const req = new Request("http://127.0.0.1:7067/mcp");
    expect(getPublicOrigin(req, BASE_ENV)).toBe("https://squirrel.hexly.ai");
    expect(getPublicOrigin(req, { ...BASE_ENV, PUBLIC_ORIGIN: "" })).toBe("http://127.0.0.1:7067");

    const hosts = getAllowedRedirectHosts(BASE_ENV);
    expect(hosts.has("oauth-redirect.googleusercontent.com")).toBe(true);
    expect(hosts.has("localhost")).toBe(true);
    expect(hosts.has("127.0.0.1")).toBe(true);
  });
});

import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBotBearerToken } from "../src/auth/bot-token";
import {
  cfAccessMiddleware,
  enforceOriginMiddleware,
  isLocalBypassAllowed,
  normalizeAccessTeamOrigin,
} from "../src/auth/cf-access";
import { dcrClientRegistrationCheck } from "../src/auth/dcr-guard";
import { encryptSecret, sha256Hex } from "../src/lib/crypto";
import { createFolder, createSecret, queryAuditLogs, upsertClientPolicy } from "../src/lib/db";
import { getMasterKey } from "../src/lib/env";
import { handleMcpRequest } from "../src/mcp/server";
import type { McpCallerContext, WorkerBindings } from "../src/types";
import { createWorkerTestHarness } from "./miniflare-env";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

describe("DCR guard & CF Access middleware", () => {
  it("validates allowed redirect hosts and HTTPS requirements", async () => {
    const h = await createWorkerTestHarness();
    cleanups.push(h.close);

    expect(
      dcrClientRegistrationCheck(
        {
          redirect_uris: [
            "https://oauth-redirect.googleusercontent.com/r/user_1",
            "https://oauth-redirect-sandbox.googleusercontent.com/r/user_1",
            "https://oauth-redirect-test.googleusercontent.com/r/user_1",
            "https://oauth-redirect.googleusercontent.com/a/app_1",
            "https://oauth-redirect-sandbox.googleusercontent.com/a/app_1",
            "https://oauth-redirect-test.googleusercontent.com/a/app_1",
            "https://vertexaisearch.cloud.google.com/oauth-redirect",
            "https://gemini.google.com/oauth/callback",
          ],
        },
        h.env,
      ),
    ).toBeUndefined();
    expect(
      dcrClientRegistrationCheck({ redirect_uris: ["http://127.0.0.1:4321/callback"] }, h.env),
    ).toBeUndefined();
    expect(
      dcrClientRegistrationCheck({ redirect_uris: ["https://evil.example.com/cb"] }, h.env)?.status,
    ).toBe(400);
    expect(
      dcrClientRegistrationCheck(
        { redirect_uris: ["https://oauth-redirect.googleusercontent.com/r/user_1#frag"] },
        h.env,
      )?.status,
    ).toBe(400);
    expect(
      dcrClientRegistrationCheck(
        { redirect_uris: ["https://user:pass@oauth-redirect.googleusercontent.com/r/user_1"] },
        h.env,
      )?.status,
    ).toBe(400);
    expect(
      dcrClientRegistrationCheck(
        { redirect_uris: ["http://oauth-redirect.googleusercontent.com/r/1"] },
        h.env,
      )?.description,
    ).toContain("HTTPS");
    expect(dcrClientRegistrationCheck({ redirect_uris: [] }, h.env)?.status).toBe(400);
    expect(
      dcrClientRegistrationCheck(
        { redirect_uris: Array.from({ length: 21 }, (_, i) => `https://localhost/${i}`) },
        h.env,
      )?.status,
    ).toBe(400);
    expect(
      dcrClientRegistrationCheck(
        { redirect_uris: [`https://localhost/${"a".repeat(2050)}`] },
        h.env,
      )?.status,
    ).toBe(400);
    expect(dcrClientRegistrationCheck({ redirect_uris: ["   "] }, h.env)?.status).toBe(400);
    expect(dcrClientRegistrationCheck({ redirect_uris: ["not-a-valid-url"] }, h.env)?.status).toBe(
      400,
    );
    expect(
      dcrClientRegistrationCheck({ redirect_uris: ["ftp://localhost/cb"] }, h.env)?.status,
    ).toBe(400);
  });

  it("normalizes CF Access team domain and enforces JWT/Origin rules", async () => {
    expect(normalizeAccessTeamOrigin("nocoo")).toBe("https://nocoo.cloudflareaccess.com");
    expect(normalizeAccessTeamOrigin("https://custom.cloudflareaccess.com/")).toBe(
      "https://custom.cloudflareaccess.com",
    );

    const h = await createWorkerTestHarness({
      ENVIRONMENT: "production",
      LOCAL_USER_EMAIL: "",
      CF_ACCESS_AUD: "aud_test",
    });
    cleanups.push(h.close);

    expect(isLocalBypassAllowed(new Request("http://127.0.0.1/admin"), h.env)).toBe(false);
    expect(
      isLocalBypassAllowed(new Request("http://127.0.0.1/admin"), {
        ...h.env,
        ENVIRONMENT: "local",
        LOCAL_USER_EMAIL: "",
      }),
    ).toBe(false);
    expect(
      isLocalBypassAllowed(
        new Request("https://squirrel.dev.hexly.ai/admin", {
          headers: { "cf-connecting-ip": "127.0.0.1" },
        }),
        { ...h.env, ENVIRONMENT: "local", LOCAL_USER_EMAIL: "dev@test" },
      ),
    ).toBe(true);
    expect(
      isLocalBypassAllowed(
        new Request("https://squirrel.dev.hexly.ai/admin", {
          headers: { "cf-connecting-ip": "203.0.113.10" },
        }),
        { ...h.env, ENVIRONMENT: "local", LOCAL_USER_EMAIL: "dev@test" },
      ),
    ).toBe(false);
    expect(
      isLocalBypassAllowed(new Request("https://squirrel.test/admin"), {
        ...h.env,
        ENVIRONMENT: "test",
        LOCAL_USER_EMAIL: "test@test",
      }),
    ).toBe(true);

    const app = new Hono<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>();
    app.use("/api/*", cfAccessMiddleware);
    app.use("/api/*", enforceOriginMiddleware);
    app.post("/api/test", (c) => c.json({ ok: true }));
    app.get("/api/me", (c) => c.json({ email: c.get("adminEmail") }));

    const missingJwt = await app.fetch(
      new Request("https://squirrel.test/api/test", { method: "POST" }),
      h.env,
    );
    expect(missingJwt.status).toBe(401);

    const badJwt = await app.fetch(
      new Request("https://squirrel.test/api/test", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": "not-a-valid-jwt" },
      }),
      h.env,
    );
    expect(badJwt.status).toBe(403);

    const devApp = new Hono<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>();
    devApp.use("/api/*", cfAccessMiddleware);
    devApp.use("/api/*", enforceOriginMiddleware);
    devApp.post("/api/test", (c) => c.json({ ok: true }));

    const devEnv: WorkerBindings = { ...h.env, ENVIRONMENT: "local", LOCAL_USER_EMAIL: "dev@test" };
    const missingOrigin = await devApp.fetch(
      new Request("http://127.0.0.1/api/test", { method: "POST" }),
      devEnv,
    );
    expect(missingOrigin.status).toBe(403);

    const crossSite = await devApp.fetch(
      new Request("http://127.0.0.1/api/test", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1", "Sec-Fetch-Site": "cross-site" },
      }),
      devEnv,
    );
    expect(crossSite.status).toBe(403);

    const nonLocalHost = await devApp.fetch(
      new Request("https://evil.example.com/api/test", {
        method: "POST",
        headers: { Origin: "https://evil.example.com" },
      }),
      devEnv,
    );
    expect(nonLocalHost.status).toBe(401);

    const badOrigin = await devApp.fetch(
      new Request("http://127.0.0.1/api/test", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
      devEnv,
    );
    expect(badOrigin.status).toBe(403);

    const goodOrigin = await devApp.fetch(
      new Request("http://127.0.0.1/api/test", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1" },
      }),
      devEnv,
    );
    expect(goodOrigin.status).toBe(200);

    // Valid RS256 Access JWT verification, claim validation, missing AUD, and GET passthrough
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const nowSec = Math.floor(Date.now() / 1000);
    const issuer = "https://nocoo.cloudflareaccess.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] })),
    );

    const signJwt = (payload: Record<string, unknown>, sub = "sub_1") =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setSubject(sub)
        .setIssuedAt(nowSec)
        .setIssuer(issuer)
        .setAudience("aud_test")
        .setExpirationTime(nowSec + 300)
        .sign(privateKey);

    const validJwt = await signJwt({ email: "Admin@Hexly.AI", name: "Nocoo" });
    const okJwtRes = await app.fetch(
      new Request("https://squirrel.test/api/me", {
        method: "GET",
        headers: { "Cf-Access-Jwt-Assertion": validJwt },
      }),
      h.env,
    );
    expect(okJwtRes.status).toBe(200);
    expect(await okJwtRes.json()).toEqual({ email: "admin@hexly.ai" });

    const badClaimsJwt = await signJwt({ email: "not-an-email" }, " ");
    const badClaimsRes = await app.fetch(
      new Request("https://squirrel.test/api/me", {
        headers: { "Cf-Access-Jwt-Assertion": badClaimsJwt },
      }),
      h.env,
    );
    expect(badClaimsRes.status).toBe(403);

    const missingAudRes = await app.fetch(
      new Request("https://squirrel.test/api/me", {
        headers: { "Cf-Access-Jwt-Assertion": validJwt },
      }),
      { ...h.env, CF_ACCESS_AUD: "" },
    );
    expect(missingAudRes.status).toBe(403);
  });
});

describe("Bot bearer tokens & MCP tools", () => {
  it("resolves active bot bearer tokens and rejects invalid/suspended/expired", async () => {
    const h = await createWorkerTestHarness();
    cleanups.push(h.close);

    const token = "sq_live_valid_token_for_testing_123456";
    const hash = await sha256Hex(token);
    const now = new Date().toISOString();

    await upsertClientPolicy(h.env.DB, {
      clientId: "bot_1",
      displayName: "CI Bot",
      registrationType: "bot_token",
      tokenHash: hash,
      tokenPreview: "sq_live_val...3456",
      allowAll: true,
      allowedFolderIds: [],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "active",
      now,
    });

    const resolved = await resolveBotBearerToken(token, "https://squirrel.test/mcp", h.env);
    expect(resolved?.audience).toBe("https://squirrel.test/mcp");
    expect(resolved?.props).toMatchObject({ clientId: "bot_1", authMethod: "bot_token" });

    expect(
      await resolveBotBearerToken("regular_oauth_token", "https://squirrel.test/mcp", h.env),
    ).toBeNull();
    await expect(
      resolveBotBearerToken("sq_live_unknown", "https://squirrel.test/mcp", h.env),
    ).rejects.toThrow("Unknown or invalid");

    // Suspended & expired bot tokens
    const suspToken = "sq_live_suspended_token_123456";
    await upsertClientPolicy(h.env.DB, {
      clientId: "bot_susp",
      displayName: "Suspended Bot",
      registrationType: "bot_token",
      tokenHash: await sha256Hex(suspToken),
      tokenPreview: "sq_live_sus...3456",
      allowAll: true,
      allowedFolderIds: [],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "suspended",
      now,
    });
    await expect(
      resolveBotBearerToken(suspToken, "https://squirrel.test/mcp", h.env),
    ).rejects.toThrow("suspended");

    const expToken = "sq_live_expired_token_123456";
    await upsertClientPolicy(h.env.DB, {
      clientId: "bot_exp",
      displayName: "Expired Bot",
      registrationType: "bot_token",
      tokenHash: await sha256Hex(expToken),
      tokenPreview: "sq_live_exp...3456",
      allowAll: true,
      allowedFolderIds: [],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "active",
      expiresAt: "2020-01-01T00:00:00.000Z",
      now,
    });
    await expect(
      resolveBotBearerToken(expToken, "https://squirrel.test/mcp", h.env),
    ).rejects.toThrow("expired");
  });

  it("handles MCP initialize, list_secrets, search_secrets, get_secret, whoami, and GET 405", async () => {
    const h = await createWorkerTestHarness();
    cleanups.push(h.close);

    const masterKey = await getMasterKey(h.env);
    const now = new Date().toISOString();
    await createFolder(h.env.DB, {
      id: "fld_ai",
      slug: "ai",
      name: "AI Tools",
      description: "",
      color: "amber",
      sortOrder: 0,
      now,
    });

    const enc1 = await encryptSecret("sk-openai-secret-9999", "sec_ai", masterKey);
    await createSecret(h.env.DB, {
      id: "sec_ai",
      folderId: "fld_ai",
      slug: "openai-key",
      name: "OpenAI API Key",
      service: "openai",
      description: "Chat completions",
      tags: ["llm"],
      metadata: { org_id: "org_1" },
      maskedPreview: "sk-o...9999",
      ciphertext: enc1.ciphertext,
      iv: enc1.iv,
      isEnabled: true,
      expiresAt: null,
      now,
    });

    const enc2 = await encryptSecret("prod-db-secret-0000", "sec_prod", masterKey);
    await createSecret(h.env.DB, {
      id: "sec_prod",
      folderId: null,
      slug: "prod-db",
      name: "Prod DB",
      service: "postgres",
      description: "Prod",
      tags: ["prod"],
      metadata: {},
      maskedPreview: "prod...0000",
      ciphertext: enc2.ciphertext,
      iv: enc2.iv,
      isEnabled: true,
      expiresAt: null,
      now,
    });

    await upsertClientPolicy(h.env.DB, {
      clientId: "cli_mcp",
      displayName: "Gemini Test",
      registrationType: "dcr",
      allowAll: false,
      allowedFolderIds: ["fld_ai"],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "active",
      now,
    });

    const caller: McpCallerContext = {
      clientId: "cli_mcp",
      clientName: "Gemini Test",
      scopes: ["secrets:list", "secrets:read"],
      authMethod: "oauth",
      userAgent: "Google",
      cfRay: "ray-123",
    };

    const getRes = await handleMcpRequest(
      new Request("https://squirrel.test/mcp", { method: "GET" }),
      h.env,
      caller,
    );
    expect(getRes.status).toBe(405);

    const waitUntil = vi.fn((p: Promise<unknown>) => p);
    const callRpc = async (body: unknown, overrideCaller: McpCallerContext = caller) => {
      const res = await handleMcpRequest(
        new Request("https://squirrel.test/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify(body),
        }),
        h.env,
        overrideCaller,
        { waitUntil },
      );
      expect(res.status).toBe(200);
      return res.json() as Promise<{
        result?: {
          protocolVersion?: string;
          serverInfo?: {
            name?: string;
            title?: string;
            websiteUrl?: string;
            icons?: { src: string; mimeType?: string; sizes?: string[] }[];
          };
          instructions?: string;
          tools?: { name: string }[];
          isError?: boolean;
          content?: { text: string }[];
        };
      }>;
    };

    const init = await callRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "Google", version: "1.0" },
      },
    });
    expect(init.result?.protocolVersion).toBe("2025-11-25");
    expect(init.result?.serverInfo).toMatchObject({
      name: "Squirrel MCP",
      title: "Squirrel MCP",
      websiteUrl: "https://squirrel.test",
      icons: [
        {
          src: "https://squirrel.test/apple-touch-icon.png",
          mimeType: "image/png",
          sizes: ["180x180"],
        },
        { src: "https://squirrel.test/logo-80.png", mimeType: "image/png", sizes: ["80x80"] },
        { src: "https://squirrel.test/logo-48.png", mimeType: "image/png", sizes: ["48x48"] },
      ],
    });
    expect(init.result?.instructions).toContain("search_secrets");

    const listedTools = await callRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(listedTools.result?.tools?.map((t) => t.name).sort()).toEqual([
      "get_secret",
      "list_secrets",
      "search_secrets",
      "whoami",
    ]);

    const whoami = await callRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "whoami", arguments: {} },
    });
    expect(JSON.parse(whoami.result?.content?.[0]?.text ?? "{}")).toMatchObject({
      clientId: "cli_mcp",
      accessibleSecretCount: 1,
    });

    const listRes = await callRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "list_secrets", arguments: {} },
    });
    const listPayload = JSON.parse(listRes.result?.content?.[0]?.text ?? "{}");
    expect(listPayload.total).toBe(1);
    expect(listPayload.secrets[0].slug).toBe("openai-key");
    expect(listPayload.secrets[0].value).toBeUndefined();

    const searchRes = await callRpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "search_secrets", arguments: { query: "openai" } },
    });
    expect(JSON.parse(searchRes.result?.content?.[0]?.text ?? "{}").total).toBe(1);

    const getAllowed = await callRpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "get_secret",
        arguments: { secret_id: "openai-key", reason: "Call OpenAI API" },
      },
    });
    expect(getAllowed.result?.isError).toBeUndefined();
    expect(JSON.parse(getAllowed.result?.content?.[0]?.text ?? "{}").value).toBe(
      "sk-openai-secret-9999",
    );

    const getDenied = await callRpc({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "get_secret",
        arguments: { secret_id: "prod-db", reason: "Probe unauthorized secret" },
      },
    });
    expect(getDenied.result?.isError).toBe(true);
    expect(JSON.parse(getDenied.result?.content?.[0]?.text ?? "{}").error).toBe("SECRET_NOT_FOUND");

    const logs = await queryAuditLogs(h.env.DB, { clientId: "cli_mcp" });
    expect(logs.total).toBe(5);
    expect(logs.items[0]).toMatchObject({ decision: "denied", errorCode: "ACCESS_DENIED" });

    // Filtered list_secrets + suspended client across all tools
    const filteredList = await callRpc({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "list_secrets",
        arguments: { service: "openai", tag: "llm", folder: "ai" },
      },
    });
    expect(JSON.parse(filteredList.result?.content?.[0]?.text ?? "{}").total).toBe(1);

    await upsertClientPolicy(h.env.DB, {
      clientId: "cli_mcp",
      displayName: "Gemini Test",
      registrationType: "dcr",
      allowAll: false,
      allowedFolderIds: ["fld_ai"],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "suspended",
      now,
    });

    for (const [idx, call] of [
      { name: "whoami", arguments: {} },
      { name: "list_secrets", arguments: {} },
      { name: "search_secrets", arguments: { query: "openai" } },
      { name: "get_secret", arguments: { secret_id: "openai-key", reason: "after suspend" } },
    ].entries()) {
      const suspRes = await callRpc({
        jsonrpc: "2.0",
        id: 20 + idx,
        method: "tools/call",
        params: call,
      });
      expect(suspRes.result?.isError).toBe(true);
    }

    // Secret-level guards: missing secret, list-only scope, disabled secret, expired secret, missing client policy
    await upsertClientPolicy(h.env.DB, {
      clientId: "cli_mcp",
      displayName: "Gemini Test",
      registrationType: "dcr",
      allowAll: true,
      allowedFolderIds: [],
      allowedSecretIds: [],
      allowPlaintextRead: true,
      status: "active",
      now,
    });

    const missingSec = await callRpc({
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: {
        name: "get_secret",
        arguments: { secret_id: "nonexistent-slug", reason: "test missing" },
      },
    });
    expect(missingSec.result?.isError).toBe(true);
    expect(JSON.parse(missingSec.result?.content?.[0]?.text ?? "{}").error).toBe(
      "SECRET_NOT_FOUND",
    );

    const listOnlyRes = await callRpc(
      {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: {
          name: "get_secret",
          arguments: { secret_id: "openai-key", reason: "no read scope" },
        },
      },
      { ...caller, scopes: ["secrets:list"] },
    );
    expect(JSON.parse(listOnlyRes.result?.content?.[0]?.text ?? "{}").error).toBe(
      "PLAINTEXT_READ_DISABLED",
    );

    await createSecret(h.env.DB, {
      id: "sec_dis",
      folderId: "fld_ai",
      slug: "disabled-key",
      name: "Disabled Key",
      service: "openai",
      description: "",
      tags: [],
      metadata: {},
      maskedPreview: "••••",
      ciphertext: enc1.ciphertext,
      iv: enc1.iv,
      isEnabled: false,
      expiresAt: null,
      now,
    });
    const disabledRes = await callRpc({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "get_secret",
        arguments: { secret_id: "disabled-key", reason: "test disabled" },
      },
    });
    expect(JSON.parse(disabledRes.result?.content?.[0]?.text ?? "{}").error).toBe(
      "SECRET_DISABLED",
    );

    const unknownCallerRes = await callRpc(
      {
        jsonrpc: "2.0",
        id: 33,
        method: "tools/call",
        params: { name: "whoami", arguments: {} },
      },
      { ...caller, clientId: "cli_nonexistent" },
    );
    expect(unknownCallerRes.result?.isError).toBe(true);
    expect(waitUntil).toHaveBeenCalled();
  });
});

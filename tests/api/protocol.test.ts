import { afterEach, describe, expect, it } from "vitest";
import { accessJwtKit, createIsolatedWorker } from "./http-worker.js";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

describe("L3 HTTP Protocol & API Integration", () => {
  it("enforces CF Access JWT on protected admin routes and health/root behavior", async () => {
    const w = await createIsolatedWorker({
      ENVIRONMENT: "production",
      LOCAL_USER_EMAIL: "",
      MASTER_KEY: btoa("12345678901234567890123456789012"),
    });
    cleanups.push(w.close);

    const rootRes = await fetch(`${w.origin}/`, { redirect: "manual" });
    expect(rootRes.status).toBe(302);
    expect(rootRes.headers.get("location")).toBe(`${w.origin}/admin`);

    const liveRes = await fetch(`${w.origin}/api/live`);
    expect(liveRes.status).toBe(200);
    expect(await liveRes.json()).toMatchObject({
      status: "ok",
      service: "squirrel",
      storage: "d1",
      database: { connected: true },
    });

    const noAuth = await fetch(`${w.origin}/api/admin/me`);
    expect(noAuth.status).toBe(401);

    const badAuth = await fetch(`${w.origin}/api/admin/me`, {
      headers: { "Cf-Access-Jwt-Assertion": "bad.jwt.value" },
    });
    expect(badAuth.status).toBe(403);

    const validJwt = await accessJwtKit().signToken({ email: "nocoo@hexly.ai" });
    const okAuth = await fetch(`${w.origin}/api/admin/me`, {
      headers: { "Cf-Access-Jwt-Assertion": validJwt },
    });
    expect(okAuth.status).toBe(200);
    expect(await okAuth.json()).toMatchObject({
      email: "nocoo@hexly.ai",
      name: "Nocoo",
      avatar: "https://lizheng.blog/avatar/nocoo.png",
      environment: "production",
    });
  });

  it("completes full Gemini OAuth 2.1 + PKCE + 3000-char state + Folder/Key ACL + Revoke flow", async () => {
    const w = await createIsolatedWorker();
    cleanups.push(w.close);

    // 1. Unauthenticated /mcp must return 401 + WWW-Authenticate (never 302)
    const unauthMcp = await fetch(`${w.origin}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      redirect: "manual",
    });
    expect(unauthMcp.status).toBe(401);
    expect(unauthMcp.headers.get("www-authenticate")).toContain("Bearer");

    // 2. Dual RFC 9728 endpoints + RFC 8414 metadata
    const prRoot = await fetch(`${w.origin}/.well-known/oauth-protected-resource`);
    const prMcp = await fetch(`${w.origin}/.well-known/oauth-protected-resource/mcp`);
    expect(prRoot.status).toBe(200);
    expect(prMcp.status).toBe(200);
    expect(await prRoot.json()).toMatchObject({ resource: `${w.origin}/mcp` });
    expect(await prMcp.json()).toMatchObject({ resource: `${w.origin}/mcp` });

    const asMeta = await fetch(`${w.origin}/.well-known/oauth-authorization-server`);
    expect(asMeta.status).toBe(200);
    expect(await asMeta.json()).toMatchObject({
      issuer: w.origin,
      authorization_endpoint: `${w.origin}/authorize`,
      token_endpoint: `${w.origin}/oauth/token`,
      registration_endpoint: `${w.origin}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    });

    // 3. Seed folder + 3 secrets via Admin API
    const fldRes = await fetch(`${w.origin}/api/admin/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "gemini", name: "Gemini Tools", color: "amber" }),
    });
    expect(fldRes.status).toBe(201);
    const folderId = ((await fldRes.json()) as { item: { id: string } }).item.id;

    const createSec = async (payload: Record<string, unknown>) => {
      const r = await fetch(`${w.origin}/api/admin/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(r.status).toBe(201);
      return ((await r.json()) as { item: { id: string } }).item.id;
    };

    const secFolderId = await createSec({
      folderId,
      slug: "cf-dns-ro",
      name: "CF DNS",
      service: "cloudflare",
      value: "cfut_allowed_token_1111",
      tags: ["dns"],
    });
    const secIndividualId = await createSec({
      folderId: null,
      slug: "notion-key",
      name: "Notion Key",
      service: "notion",
      value: "ntn_individual_token_2222",
      tags: ["notes"],
    });
    const secForbiddenId = await createSec({
      folderId: null,
      slug: "prod-admin",
      name: "Prod Admin",
      service: "aws",
      value: "aws_forbidden_3333",
      tags: ["prod"],
    });

    // 4. DCR allowlist check
    const badDcr = await fetch(`${w.origin}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Evil",
        redirect_uris: ["https://evil.example.com/cb"],
      }),
    });
    expect(badDcr.status).toBe(400);

    const redirectUri = "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-test";
    const goodDcr = await fetch(`${w.origin}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Gemini Custom App",
        redirect_uris: [
          redirectUri,
          "https://oauth-redirect-sandbox.googleusercontent.com/r/user_bound_custom-mcp-test",
          "https://oauth-redirect-test.googleusercontent.com/r/user_bound_custom-mcp-test",
          "https://oauth-redirect.googleusercontent.com/a/user_bound_custom-mcp-test",
          "https://oauth-redirect-sandbox.googleusercontent.com/a/user_bound_custom-mcp-test",
          "https://oauth-redirect-test.googleusercontent.com/a/user_bound_custom-mcp-test",
        ],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(goodDcr.status).toBe(201);
    const clientId = ((await goodDcr.json()) as { client_id: string }).client_id;

    // 5. GET /authorize with 3000-char state -> 302 to /authorize?tx=...
    const longState = "A".repeat(3000);
    const codeVerifier = "verifier-secret-string-for-pkce-s256-test-0123456789";
    const codeChallenge = await sha256Base64Url(codeVerifier);

    const authUrl = new URL(`${w.origin}/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("scope", "secrets:list secrets:read");
    authUrl.searchParams.set("state", longState);
    authUrl.searchParams.set("resource", `${w.origin}/mcp`);

    const authRes = await fetch(authUrl.toString(), { redirect: "manual" });
    expect(authRes.status).toBe(302);
    const txLocation = new URL(authRes.headers.get("location") ?? "", w.origin);
    const txId = txLocation.searchParams.get("tx");
    expect(txId).toBeTruthy();

    // 6. Inspect tx and approve folder + single secret
    const txDetailRes = await fetch(`${w.origin}/api/admin/oauth/tx/${txId}`);
    expect(txDetailRes.status).toBe(200);
    const txDetail = (await txDetailRes.json()) as { csrfToken: string };

    const decisionRes = await fetch(`${w.origin}/api/admin/oauth/tx/${txId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        csrfToken: txDetail.csrfToken,
        displayName: "Gemini 个人账号",
        allowAll: false,
        allowedFolderIds: [folderId],
        allowedSecretIds: [secIndividualId],
        allowPlaintextRead: true,
      }),
    });
    expect(decisionRes.status).toBe(200);
    const { redirectTo } = (await decisionRes.json()) as { redirectTo: string };
    const callbackUrl = new URL(redirectTo);
    expect(callbackUrl.searchParams.get("state")).toBe(longState);
    expect(callbackUrl.searchParams.get("iss")).toBe(w.origin);
    const code = callbackUrl.searchParams.get("code") ?? "";
    expect(code.length).toBeGreaterThan(0);

    // 7. Exchange code for Access & Refresh tokens
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      resource: `${w.origin}/mcp`,
    });
    const tokenRes = await fetch(`${w.origin}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();

    // 8. GET /mcp -> 405 Method Not Allowed
    const mcpGet = await fetch(`${w.origin}/mcp`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(mcpGet.status).toBe(405);

    // 9. Call MCP tools/list & get_secret (folder + individual allowed, third forbidden)
    const callMcp = async (body: unknown, token = tokens.access_token) =>
      fetch(`${w.origin}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": "Google",
        },
        body: JSON.stringify(body),
      });

    const listCall = await callMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_secrets", arguments: {} },
    });
    expect(listCall.status).toBe(200);
    const listRpc = (await listCall.json()) as { result: { content: { text: string }[] } };
    const listed = JSON.parse(listRpc.result.content[0]?.text ?? "{}") as {
      total: number;
      secrets: { id: string }[];
    };
    expect(listed.total).toBe(2);
    expect(listed.secrets.map((s) => s.id).sort()).toEqual([secFolderId, secIndividualId].sort());

    const denyCall = await callMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_secret",
        arguments: { secret_id: secForbiddenId, reason: "test boundary" },
      },
    });
    const denyRpc = (await denyCall.json()) as { result: { isError?: boolean } };
    expect(denyRpc.result.isError).toBe(true);

    // 10. Instant suspend takes effect immediately without waiting for token expiry
    await fetch(`${w.origin}/api/admin/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "suspended" }),
    });
    const suspendedCall = await callMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_secret",
        arguments: { secret_id: secFolderId, reason: "after suspend" },
      },
    });
    const suspendedRpc = (await suspendedCall.json()) as { result: { isError?: boolean } };
    expect(suspendedRpc.result.isError).toBe(true);

    // 11. POST /oauth/revoke revokes token & marks client revoked
    const revokeRes = await fetch(`${w.origin}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokens.refresh_token,
        client_id: clientId,
      }).toString(),
    });
    expect(revokeRes.status).toBe(200);

    const afterRevoke = await callMcp({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
      params: {},
    });
    expect(afterRevoke.status).toBe(401);
  });

  it("supports headless Bot Bearer Token creation, folder ACL, rotation, and revocation", async () => {
    const w = await createIsolatedWorker();
    cleanups.push(w.close);

    const fRes = await fetch(`${w.origin}/api/admin/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "bots", name: "Bots", color: "teal" }),
    });
    const folderId = ((await fRes.json()) as { item: { id: string } }).item.id;

    await fetch(`${w.origin}/api/admin/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderId,
        slug: "ci-pat",
        name: "CI PAT",
        service: "github",
        value: "ghp_bot_accessible_token",
      }),
    });

    const botRes = await fetch(`${w.origin}/api/admin/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bot_token",
        displayName: "Nightly Bot",
        allowedFolderIds: [folderId],
      }),
    });
    expect(botRes.status).toBe(201);
    const bot = (await botRes.json()) as { item: { clientId: string }; token: string };

    const getRes = await fetch(`${w.origin}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bot.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_secret",
          arguments: { secret_id: "ci-pat", reason: "Run CI check" },
        },
      }),
    });
    expect(getRes.status).toBe(200);
    const rpc = (await getRes.json()) as { result: { content: { text: string }[] } };
    expect(JSON.parse(rpc.result.content[0]?.text ?? "{}").value).toBe("ghp_bot_accessible_token");

    // Rotate token -> old fails 401, new succeeds
    const rotRes = await fetch(`${w.origin}/api/admin/clients/${bot.item.clientId}/rotate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(rotRes.status).toBe(200);
    const rotated = (await rotRes.json()) as { token: string };

    const oldFail = await fetch(`${w.origin}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bot.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(oldFail.status).toBe(401);

    const newOk = await fetch(`${w.origin}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rotated.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    });
    expect(newOk.status).toBe(200);
  });
});

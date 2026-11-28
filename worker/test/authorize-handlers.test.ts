import { AuthorizationError } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { handleAuthorizeGet, handleAuthTxDecision, handleGetAuthTx } from "../src/auth/authorize";
import type { WorkerBindings } from "../src/types";
import { createWorkerTestHarness } from "./miniflare-env";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

describe("authorize handlers L2", () => {
  it("creates KV transaction on GET /authorize, serves tx detail, and approves/denies", async () => {
    const mockRequest = {
      responseType: "code",
      clientId: "dcr_client_1",
      redirectUri: "https://oauth-redirect.googleusercontent.com/r/abc",
      scope: ["secrets:list", "secrets:read"],
      state: "S".repeat(2500),
      codeChallenge: "chal",
      codeChallengeMethod: "S256",
      issuer: "https://squirrel.test",
    };

    const h = await createWorkerTestHarness({
      OAUTH_PROVIDER: {
        parseAuthRequest: async (req: Request) => {
          const url = new URL(req.url);
          if (url.searchParams.get("bad") === "1") {
            throw new AuthorizationError("invalid_request", {
              description: "bad auth request",
              redirectUri: mockRequest.redirectUri,
              state: "s1",
              issuer: "https://squirrel.test",
            });
          }
          return mockRequest;
        },
        lookupClient: async () => ({
          clientId: "dcr_client_1",
          clientName: "Gemini App",
          redirectUris: [mockRequest.redirectUri],
          tokenEndpointAuthMethod: "none",
        }),
        completeAuthorization: async ({
          request,
        }: {
          request: { redirectUri: string; state?: string; issuer?: string };
        }) => ({
          redirectTo: `${request.redirectUri}?code=code_123&state=${request.state}&iss=${request.issuer}`,
        }),
      } as unknown as WorkerBindings["OAUTH_PROVIDER"],
    });
    cleanups.push(h.close);

    const app = new Hono<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>();
    app.use("*", async (c, next) => {
      c.set("adminEmail", c.req.header("x-test-admin") ?? "admin@test.local");
      return next();
    });
    app.get("/authorize", handleAuthorizeGet);
    app.get("/api/admin/oauth/tx/:txId", handleGetAuthTx);
    app.post("/api/admin/oauth/tx/:txId/decision", handleAuthTxDecision);

    // 1. ?tx=... passes through to ASSETS
    const spaRes = await app.fetch(new Request("https://squirrel.test/authorize?tx=tx_1"), h.env);
    expect(spaRes.status).toBe(200);
    expect(await spaRes.text()).toContain("spa");

    // 2. AuthorizationError redirects cleanly
    const errRes = await app.fetch(new Request("https://squirrel.test/authorize?bad=1"), h.env);
    expect(errRes.status).toBe(302);
    expect(errRes.headers.get("location")).toContain("error=invalid_request");

    // 3. Valid OAuth parse creates KV tx and redirects to /authorize?tx=...
    const startRes = await app.fetch(
      new Request("https://squirrel.test/authorize?response_type=code&client_id=dcr_client_1"),
      h.env,
    );
    expect(startRes.status).toBe(302);
    const txId = new URL(startRes.headers.get("location") ?? "").searchParams.get("tx") ?? "";
    expect(txId.startsWith("tx_")).toBe(true);

    // 4. GET tx detail
    const detailRes = await app.fetch(
      new Request(`https://squirrel.test/api/admin/oauth/tx/${txId}`),
      h.env,
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { csrfToken: string; clientName: string };
    expect(detail.clientName).toBe("Gemini App");

    // Different administrator cannot read or decide another admin's tx
    expect(
      (
        await app.fetch(
          new Request(`https://squirrel.test/api/admin/oauth/tx/${txId}`, {
            headers: { "x-test-admin": "other@test.local" },
          }),
          h.env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.fetch(
          new Request(`https://squirrel.test/api/admin/oauth/tx/${txId}/decision`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-test-admin": "other@test.local",
            },
            body: JSON.stringify({ decision: "deny", csrfToken: detail.csrfToken }),
          }),
          h.env,
        )
      ).status,
    ).toBe(403);

    // Missing tx returns 404
    expect(
      (await app.fetch(new Request("https://squirrel.test/api/admin/oauth/tx/tx_missing"), h.env))
        .status,
    ).toBe(404);

    // CSRF mismatch returns 403 and preserves tx
    const badCsrf = await app.fetch(
      new Request(`https://squirrel.test/api/admin/oauth/tx/${txId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "deny", csrfToken: "wrong" }),
      }),
      h.env,
    );
    expect(badCsrf.status).toBe(403);

    // Approve consumes tx and returns redirect with full 2500-char state
    const approveRes = await app.fetch(
      new Request(`https://squirrel.test/api/admin/oauth/tx/${txId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          csrfToken: detail.csrfToken,
          displayName: "Gemini Approved",
          allowAll: false,
          allowedFolderIds: [],
          allowedSecretIds: [],
          allowPlaintextRead: true,
        }),
      }),
      h.env,
    );
    expect(approveRes.status).toBe(200);
    const { redirectTo } = (await approveRes.json()) as { redirectTo: string };
    expect(redirectTo).toContain(`state=${"S".repeat(2500)}`);

    // Replay on consumed tx returns 404
    const replayRes = await app.fetch(
      new Request(`https://squirrel.test/api/admin/oauth/tx/${txId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "deny", csrfToken: detail.csrfToken }),
      }),
      h.env,
    );
    expect(replayRes.status).toBe(404);

    // Start a second tx and deny it
    const start2 = await app.fetch(
      new Request("https://squirrel.test/authorize?response_type=code&client_id=dcr_client_1"),
      h.env,
    );
    const txId2 = new URL(start2.headers.get("location") ?? "").searchParams.get("tx") ?? "";
    const detail2 = (await (
      await app.fetch(new Request(`https://squirrel.test/api/admin/oauth/tx/${txId2}`), h.env)
    ).json()) as { csrfToken: string };
    const denyRes = await app.fetch(
      new Request(`https://squirrel.test/api/admin/oauth/tx/${txId2}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "deny", csrfToken: detail2.csrfToken }),
      }),
      h.env,
    );
    expect(denyRes.status).toBe(200);
    expect(((await denyRes.json()) as { redirectTo: string }).redirectTo).toContain(
      "error=access_denied",
    );

    // Invalid JSON / invalid payload on decision
    expect(
      (
        await app.fetch(
          new Request(`https://squirrel.test/api/admin/oauth/tx/${txId2}/decision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{not-json",
          }),
          h.env,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(
          new Request(`https://squirrel.test/api/admin/oauth/tx/${txId2}/decision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "unknown" }),
          }),
          h.env,
        )
      ).status,
    ).toBe(400);

    // Missing OAUTH_PROVIDER & generic parseAuthRequest Error
    const noProviderApp = new Hono<{
      Bindings: WorkerBindings;
      Variables: { adminEmail: string };
    }>();
    noProviderApp.use("*", async (c, next) => {
      c.set("adminEmail", "admin@test.local");
      return next();
    });
    noProviderApp.get("/authorize", handleAuthorizeGet);
    noProviderApp.post("/api/admin/oauth/tx/:txId/decision", handleAuthTxDecision);

    expect(
      (
        await noProviderApp.fetch(new Request("https://squirrel.test/authorize"), {
          ...h.env,
          OAUTH_PROVIDER: undefined,
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await noProviderApp.fetch(
          new Request("https://squirrel.test/api/admin/oauth/tx/tx_1/decision", { method: "POST" }),
          { ...h.env, OAUTH_PROVIDER: undefined },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await noProviderApp.fetch(new Request("https://squirrel.test/authorize"), {
          ...h.env,
          OAUTH_PROVIDER: {
            parseAuthRequest: async () => {
              throw new Error("boom");
            },
          } as unknown as WorkerBindings["OAUTH_PROVIDER"],
        })
      ).status,
    ).toBe(400);
  });
});

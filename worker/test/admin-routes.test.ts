import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { adminRoutes } from "../src/admin/routes";
import type { WorkerBindings } from "../src/types";
import { createWorkerTestHarness } from "./miniflare-env";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

function buildAdminApp() {
  const app = new Hono<{ Bindings: WorkerBindings; Variables: { adminEmail: string } }>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("adminEmail", "admin@test.local");
    return next();
  });
  app.route("/api/admin", adminRoutes);
  return app;
}

describe("adminRoutes L2 coverage", () => {
  it("handles folders, secrets, reveal, bot token lifecycle, stats, and logs", async () => {
    const mockClients = new Map<string, Record<string, unknown>>();
    const h = await createWorkerTestHarness({
      OAUTH_PROVIDER: {
        createClient: async (info: {
          redirectUris?: string[];
          clientName?: string;
          tokenEndpointAuthMethod?: string;
        }) => {
          const client = {
            clientId: "static_cid_1",
            clientSecret: "static_csec_1",
            redirectUris: info.redirectUris ?? [],
            clientName: info.clientName,
            tokenEndpointAuthMethod: info.tokenEndpointAuthMethod ?? "client_secret_post",
          };
          mockClients.set(client.clientId, client);
          return client;
        },
        deleteClient: async (clientId: string) => {
          mockClients.delete(clientId);
        },
      } as unknown as WorkerBindings["OAUTH_PROVIDER"],
    });
    cleanups.push(h.close);

    const app = buildAdminApp();
    const req = (path: string, method = "GET", body?: unknown) =>
      app.fetch(
        new Request(`https://squirrel.test/api/admin${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
        h.env,
      );

    expect((await req("/me")).status).toBe(200);

    // Folders CRUD + duplicate slug 409 + 404
    const fRes = await req("/folders", "POST", {
      slug: "work",
      name: "Work",
      description: "Work keys",
      color: "blue",
    });
    expect(fRes.status).toBe(201);
    const folderId = ((await fRes.json()) as { item: { id: string } }).item.id;

    expect((await req("/folders", "POST", { slug: "work", name: "Dup" })).status).toBe(409);
    expect((await req(`/folders/${folderId}`, "PUT", { name: "Work Prod" })).status).toBe(200);
    expect((await req("/folders/missing", "PUT", { name: "X" })).status).toBe(404);
    expect((await req("/folders")).status).toBe(200);

    // Secrets CRUD + reveal + duplicate 409 + 404
    const sRes = await req("/secrets", "POST", {
      folderId,
      slug: "gh-token",
      name: "GitHub Token",
      service: "github",
      value: "ghp_secret_value_12345",
      tags: ["git"],
      metadata: { org: "nocoo" },
    });
    expect(sRes.status).toBe(201);
    const secretId = ((await sRes.json()) as { item: { id: string } }).item.id;

    expect(
      (
        await req("/secrets", "POST", {
          folderId: "fld_missing",
          slug: "bad",
          name: "Bad",
          service: "s",
          value: "v",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req("/secrets", "POST", {
          slug: "gh-token",
          name: "Dup",
          service: "github",
          value: "v",
        })
      ).status,
    ).toBe(409);

    const revealRes = await req(`/secrets/${secretId}/reveal`);
    expect(revealRes.status).toBe(200);
    expect(((await revealRes.json()) as { value: string }).value).toBe("ghp_secret_value_12345");
    expect((await req("/secrets/missing/reveal")).status).toBe(404);

    const updSec = await req(`/secrets/${secretId}`, "PUT", {
      value: "ghp_rotated_value_67890",
      isEnabled: true,
    });
    expect(updSec.status).toBe(200);
    expect((await req("/secrets/missing", "PUT", { name: "X" })).status).toBe(404);
    expect((await req("/secrets")).status).toBe(200);

    // Bot token & static OAuth client CRUD + rotate + revoke
    const botRes = await req("/clients", "POST", {
      type: "bot_token",
      displayName: "Bot One",
      allowedFolderIds: [folderId],
    });
    expect(botRes.status).toBe(201);
    const botData = (await botRes.json()) as { item: { clientId: string }; token: string };
    expect(botData.token.startsWith("sq_live_")).toBe(true);

    const oauthRes = await req("/clients", "POST", {
      type: "static_oauth",
      displayName: "Static App",
      redirectUris: ["https://oauth-redirect.googleusercontent.com/r/abc"],
      allowAll: true,
    });
    expect(oauthRes.status).toBe(201);

    expect(
      (
        await req("/clients", "POST", {
          type: "static_oauth",
          displayName: "Bad Redirect",
          redirectUris: ["https://evil.example/cb"],
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await req(`/clients/${botData.item.clientId}`, "PATCH", {
          status: "suspended",
        })
      ).status,
    ).toBe(200);
    expect((await req("/clients/missing", "PATCH", { status: "active" })).status).toBe(404);

    const rotRes = await req(`/clients/${botData.item.clientId}/rotate-token`, "POST", {});
    expect(rotRes.status).toBe(200);
    expect((await req("/clients/static_cid_1/rotate-token", "POST", {})).status).toBe(400);

    expect((await req(`/clients/${botData.item.clientId}/revoke`, "POST", {})).status).toBe(200);
    expect((await req("/clients/static_cid_1/revoke", "POST", {})).status).toBe(200);
    expect((await req("/clients/missing/revoke", "POST", {})).status).toBe(404);
    expect((await req("/clients")).status).toBe(200);

    // Stats & logs
    const statsRes = await req("/stats?days=7");
    expect(statsRes.status).toBe(200);
    const logsRes = await req("/logs?toolName=admin_reveal&limit=10");
    expect(logsRes.status).toBe(200);
    expect(((await logsRes.json()) as { total: number }).total).toBe(1);

    // Delete secret & folder
    expect((await req(`/secrets/${secretId}`, "DELETE")).status).toBe(200);
    expect((await req(`/secrets/${secretId}`, "DELETE")).status).toBe(404);
    expect((await req(`/folders/${folderId}`, "DELETE")).status).toBe(200);
    expect((await req(`/folders/${folderId}`, "DELETE")).status).toBe(404);

    // Invalid payloads & 400 validation branches
    expect((await req("/folders", "POST", { slug: "!", name: "" })).status).toBe(400);
    expect((await req("/folders/f1", "PUT", { slug: "!" })).status).toBe(400);
    expect((await req("/secrets", "POST", { slug: "!", name: "" })).status).toBe(400);
    expect((await req("/secrets/s1", "PUT", { slug: "!" })).status).toBe(400);
    expect((await req("/secrets/s1", "PUT", { folderId: "fld_nope" })).status).toBe(400);
    expect((await req("/clients", "POST", { type: "bad" })).status).toBe(400);
    expect((await req("/clients/c1", "PATCH", { status: "bad" })).status).toBe(400);
    expect((await req("/clients/missing/rotate-token", "POST", {})).status).toBe(404);
  });

  it("handles missing OAUTH_PROVIDER and duplicate folder/secret updates", async () => {
    const h = await createWorkerTestHarness({ OAUTH_PROVIDER: undefined });
    cleanups.push(h.close);
    const app = buildAdminApp();
    const req = (path: string, method = "GET", body?: unknown) =>
      app.fetch(
        new Request(`https://squirrel.test/api/admin${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
        h.env,
      );

    expect(
      (
        await req("/clients", "POST", {
          type: "static_oauth",
          displayName: "No Provider",
          redirectUris: ["http://localhost:3000/cb"],
        })
      ).status,
    ).toBe(500);
    expect((await req("/clients/missing/rotate-token", "POST", {})).status).toBe(404);

    const f1 = (
      (await (await req("/folders", "POST", { slug: "f-a", name: "A" })).json()) as {
        item: { id: string };
      }
    ).item.id;
    await req("/folders", "POST", { slug: "f-b", name: "B" });
    expect((await req(`/folders/${f1}`, "PUT", { slug: "f-b" })).status).toBe(409);

    const s1 = (
      (await (
        await req("/secrets", "POST", {
          slug: "s-a",
          name: "A",
          service: "cf",
          value: "secret123456",
        })
      ).json()) as { item: { id: string } }
    ).item.id;
    await req("/secrets", "POST", { slug: "s-b", name: "B", service: "cf", value: "secret123456" });
    expect((await req(`/secrets/${s1}`, "PUT", { slug: "s-b" })).status).toBe(409);
  });
});

import OAuthProvider, {
  type OAuthResourceContext,
  insufficientScope,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import pkg from "../../package.json";
import { adminRoutes } from "./admin/routes";
import { handleAuthorizeGet } from "./auth/authorize";
import { resolveBotBearerToken } from "./auth/bot-token";
import { cfAccessMiddleware, enforceOriginMiddleware } from "./auth/cf-access";
import { dcrClientRegistrationCheck } from "./auth/dcr-guard";
import { getClientPolicy, purgeExpiredAuditLogs } from "./lib/db";
import { getPublicOrigin } from "./lib/env";
import { handleMcpRequest } from "./mcp/server";
import type { McpCallerContext, OAuthProps, WorkerBindings } from "./types";

const SCOPES_SUPPORTED = ["secrets:list", "secrets:read"];

function buildDefaultApp() {
  const app = new Hono<{
    Bindings: WorkerBindings;
    Variables: { adminEmail: string; adminName?: string | null };
  }>();

  app.get("/", (c) => {
    const origin = getPublicOrigin(c.req.raw, c.env);
    return Response.redirect(`${origin}/admin`, 302);
  });

  app.get("/api/live", async (c) => {
    let connected = false;
    try {
      await c.env.DB.prepare("SELECT 1").first();
      connected = true;
    } catch {
      connected = false;
    }
    return c.json(
      {
        status: connected ? "ok" : "degraded",
        service: "squirrel",
        version: pkg.version,
        storage: "d1",
        database: { connected },
      },
      connected ? 200 : 503,
    );
  });

  app.use("/authorize", cfAccessMiddleware);
  app.get("/authorize", handleAuthorizeGet);

  app.use("/api/admin/*", cfAccessMiddleware);
  app.use("/api/admin/*", enforceOriginMiddleware);
  app.route("/api/admin", adminRoutes);

  app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
  return app;
}

const defaultApp = buildDefaultApp();

async function shouldEnforceInsufficientScope(
  request: Request,
  auth: OAuthResourceContext<OAuthProps>["auth"],
  props: OAuthProps,
): Promise<Response | null> {
  if (props.authMethod === "bot_token" || auth.scope.includes("secrets:read")) {
    return null;
  }
  if (request.method !== "POST") {
    return null;
  }
  try {
    const body = (await request.clone().json()) as {
      method?: string;
      params?: { name?: string };
    };
    if (body?.method === "tools/call" && body.params?.name === "get_secret") {
      return insufficientScope(auth, ["secrets:read"], "Scope secrets:read is required");
    }
  } catch {
    return null;
  }
  return null;
}

const providerCache = new Map<string, OAuthProvider<WorkerBindings>>();

function getOAuthProvider(origin: string, env: WorkerBindings): OAuthProvider<WorkerBindings> {
  const cacheKey = `${origin}|${env.ALLOWED_REDIRECT_HOSTS}|${env.ENVIRONMENT}`;
  let provider = providerCache.get(cacheKey);
  if (!provider) {
    provider = new OAuthProvider<WorkerBindings>({
      apiRoute: "/mcp",
      apiHandler: {
        async fetch(request, workerEnv, ctx) {
          if (request.method === "GET") {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: { Allow: "POST" },
            });
          }
          const oauthCtx = ctx as unknown as OAuthResourceContext<OAuthProps>;
          const props = oauthCtx.props ?? { clientId: "unknown", email: "unknown" };
          const scopeError = await shouldEnforceInsufficientScope(request, oauthCtx.auth, props);
          if (scopeError) {
            return scopeError;
          }

          const clientId = oauthCtx.auth.clientId ?? props.clientId;
          const policy = await getClientPolicy(workerEnv.DB, clientId);
          const caller: McpCallerContext = {
            clientId,
            clientName: policy?.displayName ?? clientId,
            scopes: oauthCtx.auth.scope ?? [],
            authMethod: props.authMethod ?? "oauth",
            userAgent: request.headers.get("User-Agent"),
            cfRay: request.headers.get("cf-ray"),
          };

          return handleMcpRequest(request, workerEnv, caller, ctx);
        },
      },
      defaultHandler: defaultApp as unknown as ExportedHandler<WorkerBindings>,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      scopesSupported: SCOPES_SUPPORTED,
      requiredScopes: SCOPES_SUPPORTED,
      accessTokenTTL: 3600,
      resourceMetadata: {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        bearer_methods_supported: ["header"],
        resource_name: "Squirrel MCP",
      },
      clientRegistrationCallback: ({ clientMetadata }) =>
        dcrClientRegistrationCheck(clientMetadata, env),
      resolveExternalToken: ({ token }) => resolveBotBearerToken(token, `${origin}/mcp`, env),
    });
    providerCache.set(cacheKey, provider);
  }
  return provider;
}

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function withSecurityHeaders(response: Response, env: WorkerBindings): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    env.ENVIRONMENT === "production" ? PRODUCTION_CSP : "frame-ancestors 'none'",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
  headers.set("Cache-Control", "no-store");
  return headers;
}

function handleProtectedResourceMetadataRoot(request: Request, origin: string): Response {
  const headers = corsHeaders();
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("Allow", "GET, HEAD, OPTIONS");
    return new Response("Method Not Allowed", { status: 405, headers });
  }
  headers.set("Content-Type", "application/json");
  const body = JSON.stringify({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: SCOPES_SUPPORTED,
    resource_name: "Squirrel MCP",
  });
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}

async function handleRevokeAlias(
  request: Request,
  provider: OAuthProvider<WorkerBindings>,
  env: WorkerBindings,
  ctx: ExecutionContext,
): Promise<Response> {
  let targetReq = request;
  const contentType = request.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = (await request.clone().json()) as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === "string") params.set(k, v);
      }
      const headers = new Headers(request.headers);
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      const targetUrl = new URL(request.url);
      targetUrl.pathname = "/oauth/token";
      targetReq = new Request(targetUrl.toString(), {
        method: request.method,
        headers,
        body: params.toString(),
      });
    } catch {
      // Fall through with rewritten URL.
    }
  }

  if (targetReq === request) {
    const targetUrl = new URL(request.url);
    targetUrl.pathname = "/oauth/token";
    targetReq = new Request(targetUrl.toString(), request);
  }

  return provider.fetch(targetReq, env, ctx);
}

export default {
  async fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = getPublicOrigin(request, env);

    // Serve both /.well-known/oauth-protected-resource and .../mcp for RFC 9728 compatibility.
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      return withSecurityHeaders(handleProtectedResourceMetadataRoot(request, origin), env);
    }

    const provider = getOAuthProvider(origin, env);

    if (url.pathname === "/oauth/revoke" && request.method === "POST") {
      return withSecurityHeaders(await handleRevokeAlias(request, provider, env, ctx), env);
    }

    return withSecurityHeaders(await provider.fetch(request, env, ctx), env);
  },

  async scheduled(
    _controller: ScheduledController,
    env: WorkerBindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    const origin = env.PUBLIC_ORIGIN?.trim() || "https://squirrel.hexly.ai";
    const provider = getOAuthProvider(origin, env);
    ctx.waitUntil(
      Promise.all([purgeExpiredAuditLogs(env.DB, 90), provider.purgeExpiredData(env)]).then(
        () => undefined,
      ),
    );
  },
};

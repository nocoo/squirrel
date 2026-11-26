import {
  ExternalTokenError,
  type ResolveExternalTokenResult,
} from "@cloudflare/workers-oauth-provider";
import { sha256Hex } from "../lib/crypto";
import { getClientPolicyByTokenHash } from "../lib/db";
import type { OAuthProps, WorkerBindings } from "../types";

export async function resolveBotBearerToken(
  token: string,
  resourceUrl: string,
  env: WorkerBindings,
): Promise<ResolveExternalTokenResult | null> {
  if (!token.startsWith("sq_live_")) {
    return null;
  }

  const hash = await sha256Hex(token);
  const policy = await getClientPolicyByTokenHash(env.DB, hash);
  if (policy?.registrationType !== "bot_token") {
    throw new ExternalTokenError("invalid_token", {
      description: "Unknown or invalid bot bearer token",
      statusCode: 401,
    });
  }

  if (policy.status !== "active") {
    throw new ExternalTokenError("invalid_token", {
      description: `Bot credential is ${policy.status}`,
      statusCode: 401,
    });
  }

  if (policy.expiresAt && Date.parse(policy.expiresAt) <= Date.now()) {
    throw new ExternalTokenError("invalid_token", {
      description: "Bot credential has expired",
      statusCode: 401,
    });
  }

  const props: OAuthProps = {
    clientId: policy.clientId,
    email: `bot:${policy.clientId}`,
    authMethod: "bot_token",
  };

  return {
    props,
    audience: resourceUrl,
  };
}

import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const TEST_AUD = "test-squirrel-access-aud";

export function createAccessJwtKit(issuer = "https://nocoo.cloudflareaccess.com") {
  const keyPairPromise = generateKeyPair("RS256");

  async function signToken(
    overrides: Partial<{
      email: string;
      sub: string;
      aud: string;
      iss: string;
      expOffsetSec: number;
    }> = {},
  ): Promise<string> {
    const { privateKey } = await keyPairPromise;
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: overrides.email ?? "admin@hexly.ai" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setSubject(overrides.sub ?? "sub-admin-1")
      .setIssuedAt(now)
      .setIssuer(overrides.iss ?? issuer)
      .setAudience(overrides.aud ?? TEST_AUD)
      .setExpirationTime(now + (overrides.expOffsetSec ?? 300))
      .sign(privateKey);
  }

  async function jwksResponse(): Promise<Response> {
    const { publicKey } = await keyPairPromise;
    const jwk = await exportJWK(publicKey);
    return new Response(
      JSON.stringify({ keys: [{ ...jwk, kid: "test-key-1", alg: "RS256", use: "sig" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  return { signToken, jwksResponse };
}

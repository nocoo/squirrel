#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://squirrel.hexly.ai}"

echo "=== 1. Unauthenticated POST /mcp must return 401 + WWW-Authenticate (never 302) ==="
HTTP_401=$(curl -s -i -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')
echo "$HTTP_401" | head -n 15
echo "$HTTP_401" | grep -qi "401" || { echo "FAIL: expected 401"; exit 1; }
echo "$HTTP_401" | grep -qi "www-authenticate" || { echo "FAIL: missing WWW-Authenticate"; exit 1; }

echo "=== 2. RFC 9728 Protected Resource Metadata (root & /mcp suffix) ==="
curl -sf "$BASE/.well-known/oauth-protected-resource" | jq .
curl -sf "$BASE/.well-known/oauth-protected-resource/mcp" | jq .

echo "=== 3. RFC 8414 Authorization Server Metadata ==="
curl -sf "$BASE/.well-known/oauth-authorization-server" | jq \
  '{issuer, authorization_endpoint, token_endpoint, registration_endpoint, revocation_endpoint, code_challenge_methods_supported, grant_types_supported}'

echo "=== 4. DCR redirect_uri allowlist check ==="
BAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Evil","redirect_uris":["https://evil.example.com/cb"]}')
echo "Illegal DCR status (expect 400): $BAD_CODE"
test "$BAD_CODE" = "400" || { echo "FAIL: illegal redirect_uri was not rejected"; exit 1; }

DCR_RES=$(curl -sf -X POST "$BASE/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Gemini Test","redirect_uris":["https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-test"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"}')
echo "$DCR_RES" | jq .
CLIENT_ID=$(echo "$DCR_RES" | jq -r .client_id)

echo "=== 5. 3000-char state stress check on /authorize ==="
LONG_STATE=$(python3 -c 'print("A"*3000)')
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-test&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&scope=secrets:list+secrets:read&state=$LONG_STATE")
echo "Authorize with 3000-char state status (expect 302 to CF Access, NOT 400/414): $AUTH_STATUS"
test "$AUTH_STATUS" = "302" -o "$AUTH_STATUS" = "200" || { echo "FAIL: long state rejected"; exit 1; }

echo "=== PASS: Squirrel OAuth discovery & Gemini protocol checks passed ==="

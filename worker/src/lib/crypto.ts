function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

async function importAesKey(
  masterKeyB64: string,
  usage: ("encrypt" | "decrypt")[],
): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(masterKeyB64);
  if (keyBytes.byteLength !== 32) {
    throw new Error("MASTER_KEY must decode to 32 bytes (AES-256)");
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, usage);
}

export async function encryptSecret(
  plaintext: string,
  secretId: string,
  masterKeyB64: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importAesKey(masterKeyB64, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(secretId),
    },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptSecret(
  ciphertextB64: string,
  ivB64: string,
  secretId: string,
  masterKeyB64: string,
): Promise<string> {
  const key = await importAesKey(masterKeyB64, ["decrypt"]);
  const plainBuf = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivB64),
      additionalData: new TextEncoder().encode(secretId),
    },
    key,
    base64ToBytes(ciphertextB64),
  );
  return new TextDecoder().decode(plainBuf);
}

export function maskSecretValue(plaintext: string): string {
  if (plaintext.length <= 8) {
    return "••••••••";
  }
  return `${plaintext.slice(0, 4)}...${plaintext.slice(-4)}`;
}

export function maskBotToken(token: string): string {
  if (token.length <= 14) {
    return "sq_live_••••";
  }
  return `${token.slice(0, 11)}...${token.slice(-4)}`;
}

export function generateId(prefix: string): string {
  const random = crypto.getRandomValues(new Uint8Array(10));
  return `${prefix}_${bytesToHex(random)}`;
}

export function generateBotToken(): string {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return `sq_live_${bytesToBase64Url(random)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

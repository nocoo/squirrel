const SLUG_REGEX = /^[a-z0-9][a-z0-9-_]{1,62}$/;

export function isValidSlug(value: string): boolean {
  return SLUG_REGEX.test(value.trim());
}

export function slugifyName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 62);
}

export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(/[,，\n]/)) {
    const clean = part.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(clean);
  }
  return tags.slice(0, 20);
}

export function parseMetadataJson(raw: string):
  | {
      ok: true;
      value: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
    } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "附加元数据必须是合法的 JSON 对象" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "附加元数据顶层必须是键值对对象" };
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    } else {
      return { ok: false, error: `元数据字段 "${k}" 的值必须是字符串、数字或布尔值` };
    }
  }
  return { ok: true, value: out };
}

export function validateFolderForm(input: { name: string; slug: string }): string | null {
  if (!input.name.trim()) {
    return "请输入文件夹名称";
  }
  if (!isValidSlug(input.slug)) {
    return "Slug 仅支持小写字母、数字、短横线或下划线（2–63 字符）";
  }
  return null;
}

export function validateSecretForm(input: {
  name: string;
  slug: string;
  service: string;
  value: string;
  isEdit: boolean;
  metadataRaw: string;
}): string | null {
  if (!input.name.trim()) return "请输入密钥名称";
  if (!isValidSlug(input.slug)) {
    return "Slug 仅支持小写字母、数字、短横线或下划线（2–63 字符）";
  }
  if (!input.service.trim()) return "请输入归属服务（如 cloudflare、github）";
  if (!input.isEdit && !input.value) return "请输入密钥明文值";
  const metaCheck = parseMetadataJson(input.metadataRaw);
  if (!metaCheck.ok) return metaCheck.error;
  return null;
}

export function validateClientForm(input: {
  type: "bot_token" | "static_oauth";
  displayName: string;
  redirectUrisRaw: string;
}): string | null {
  if (!input.displayName.trim()) {
    return "请输入消费方名称";
  }
  if (input.type === "static_oauth") {
    const uris = input.redirectUrisRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (uris.length === 0) {
      return "静态 OAuth 客户端至少需要一个回调地址（Redirect URI）";
    }
    for (const uri of uris) {
      try {
        new URL(uri);
      } catch {
        return `无效的回调 URL：${uri}`;
      }
    }
  }
  return null;
}

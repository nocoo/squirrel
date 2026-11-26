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

export type FolderFieldErrors = Partial<Record<"name" | "slug", string>>;

export function validateFolderFields(input: { name: string; slug: string }): FolderFieldErrors {
  const errors: FolderFieldErrors = {};
  if (!input.name.trim()) {
    errors.name = "请输入文件夹名称";
  }
  if (!isValidSlug(input.slug)) {
    errors.slug = "Slug 仅支持小写字母、数字、短横线或下划线（2–63 字符）";
  }
  return errors;
}

export function validateFolderForm(input: { name: string; slug: string }): string | null {
  const errors = validateFolderFields(input);
  return errors.name ?? errors.slug ?? null;
}

export type SecretFieldErrors = Partial<
  Record<"name" | "slug" | "service" | "value" | "metadataRaw", string>
>;

export function validateSecretFields(input: {
  name: string;
  slug: string;
  service: string;
  value: string;
  isEdit: boolean;
  metadataRaw: string;
}): SecretFieldErrors {
  const errors: SecretFieldErrors = {};
  if (!input.name.trim()) errors.name = "请输入密钥名称";
  if (!isValidSlug(input.slug)) {
    errors.slug = "Slug 仅支持小写字母、数字、短横线或下划线（2–63 字符）";
  }
  if (!input.service.trim()) errors.service = "请输入归属服务（如 cloudflare、github）";
  if (!input.isEdit && !input.value) errors.value = "请输入密钥明文值";
  const metaCheck = parseMetadataJson(input.metadataRaw);
  if (!metaCheck.ok) errors.metadataRaw = metaCheck.error;
  return errors;
}

export function validateSecretForm(input: {
  name: string;
  slug: string;
  service: string;
  value: string;
  isEdit: boolean;
  metadataRaw: string;
}): string | null {
  const errors = validateSecretFields(input);
  return errors.name ?? errors.slug ?? errors.service ?? errors.value ?? errors.metadataRaw ?? null;
}

export type ClientFieldErrors = Partial<Record<"displayName" | "redirectUrisRaw", string>>;

export function validateClientFields(input: {
  type: "bot_token" | "static_oauth";
  displayName: string;
  redirectUrisRaw: string;
}): ClientFieldErrors {
  const errors: ClientFieldErrors = {};
  if (!input.displayName.trim()) {
    errors.displayName = "请输入消费方名称";
  }
  if (input.type === "static_oauth") {
    const uris = input.redirectUrisRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (uris.length === 0) {
      errors.redirectUrisRaw = "静态 OAuth 客户端至少需要一个回调地址（Redirect URI）";
    } else {
      for (const uri of uris) {
        try {
          new URL(uri);
        } catch {
          errors.redirectUrisRaw = `无效的回调 URL：${uri}`;
          break;
        }
      }
    }
  }
  return errors;
}

export function validateClientForm(input: {
  type: "bot_token" | "static_oauth";
  displayName: string;
  redirectUrisRaw: string;
}): string | null {
  const errors = validateClientFields(input);
  return errors.displayName ?? errors.redirectUrisRaw ?? null;
}

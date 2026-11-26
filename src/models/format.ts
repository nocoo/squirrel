import type { BadgeTone } from "@nocoo/basalt/components/badge";
import type { DatePickerPreset } from "@nocoo/basalt/components/date-picker";
import type { TagColor } from "@nocoo/basalt/components/tag-badge";
import type { AuditDecision, ClientPolicyItem, ClientStatus, RegistrationType } from "./types";

const FOLDER_COLOR_ALLOWLIST = new Set<TagColor>([
  "amber",
  "blue",
  "teal",
  "violet",
  "rose",
  "slate",
]);

export const FOLDER_COLOR_OPTIONS: { value: TagColor; label: string }[] = [
  { value: "amber", label: "琥珀" },
  { value: "blue", label: "晴蓝" },
  { value: "teal", label: "青碧" },
  { value: "violet", label: "紫罗兰" },
  { value: "rose", label: "玫瑰" },
  { value: "slate", label: "石板灰" },
];

export const FOLDER_COLOR_VALUES: readonly TagColor[] = FOLDER_COLOR_OPTIONS.map(
  (opt) => opt.value,
);

export const FOLDER_COLOR_LABELS: Partial<Record<TagColor, string>> = Object.fromEntries(
  FOLDER_COLOR_OPTIONS.map((opt) => [opt.value, opt.label]),
) as Partial<Record<TagColor, string>>;

export function buildExpiryPresets(nowMs = Date.now()): DatePickerPreset[] {
  const isoInDays = (days: number) =>
    new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);
  return [
    { label: "30 天后", value: isoInDays(30) },
    { label: "90 天后", value: isoInDays(90) },
    { label: "180 天后", value: isoInDays(180) },
    { label: "1 年后", value: isoInDays(365) },
  ];
}

export function resolveFolderTagColor(color: string): TagColor {
  return FOLDER_COLOR_ALLOWLIST.has(color as TagColor) ? (color as TagColor) : "amber";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "从未";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Date(time).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatShortDate(isoDate: string): string {
  return isoDate.length >= 10 ? isoDate.slice(5, 10) : isoDate;
}

export function getExpiryBadge(
  expiresAt: string | null,
  nowMs = Date.now(),
): { label: string; tone: BadgeTone } | null {
  if (!expiresAt) return null;
  const expMs = Date.parse(expiresAt);
  if (Number.isNaN(expMs)) return null;
  const diffDays = Math.ceil((expMs - nowMs) / 86_400_000);
  if (diffDays <= 0) {
    return { label: "已过期", tone: "danger" };
  }
  if (diffDays <= 30) {
    return { label: `${diffDays} 天后过期`, tone: "warning" };
  }
  return { label: `有效期至 ${expiresAt.slice(0, 10)}`, tone: "neutral" };
}

export function getClientStatusMeta(status: ClientStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case "active":
      return { label: "运行中", tone: "success" };
    case "suspended":
      return { label: "已暂停", tone: "warning" };
    case "revoked":
      return { label: "已吊销", tone: "danger" };
  }
}

export function getRegistrationTypeLabel(type: RegistrationType): string {
  switch (type) {
    case "dcr":
      return "OAuth DCR";
    case "static_oauth":
      return "静态 OAuth";
    case "bot_token":
      return "Bot Token";
  }
}

export function getAuditDecisionMeta(decision: AuditDecision): { label: string; tone: BadgeTone } {
  switch (decision) {
    case "allowed":
      return { label: "放行", tone: "success" };
    case "denied":
      return { label: "拒绝", tone: "danger" };
    case "expired":
      return { label: "已过期", tone: "warning" };
    case "disabled":
      return { label: "已停用", tone: "warning" };
    case "not_found":
      return { label: "未找到", tone: "neutral" };
  }
}

export function summarizeClientScope(policy: ClientPolicyItem): string {
  if (policy.allowAll) {
    return "全部密钥（*）";
  }
  const parts: string[] = [];
  if (policy.allowedFolderIds.length > 0) {
    parts.push(`${policy.allowedFolderIds.length} 个文件夹`);
  }
  if (policy.allowedSecretIds.length > 0) {
    parts.push(`${policy.allowedSecretIds.length} 个单独密钥`);
  }
  return parts.length > 0 ? parts.join(" + ") : "未分配权限";
}

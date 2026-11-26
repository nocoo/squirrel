import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encryptSecret,
  maskBotToken,
  maskSecretValue,
  sha256Hex,
} from "../worker/src/lib/crypto.ts";

function sqlEscape(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

async function computeLocalMasterKey(): Promise<string> {
  const seed = new TextEncoder().encode("squirrel-nonprod-master-key:local");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
  let binary = "";
  for (let i = 0; i < digest.byteLength; i++) {
    binary += String.fromCharCode(digest[i] ?? 0);
  }
  return btoa(binary);
}

interface SeedFolder {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

interface SeedSecret {
  id: string;
  folderId: string | null;
  slug: string;
  name: string;
  service: string;
  description: string;
  tags: string[];
  metadata: Record<string, string>;
  plaintext: string;
  isEnabled: boolean;
  expiresInDays: number | null;
  lastUsedDaysAgo: number | null;
  createdDaysAgo: number;
  useCount: number;
}

interface SeedClient {
  clientId: string;
  displayName: string;
  registrationType: "dcr" | "static_oauth" | "bot_token";
  rawToken?: string;
  allowAll: boolean;
  allowedFolderIds: string[];
  allowedSecretIds: string[];
  allowPlaintextRead: boolean;
  status: "active" | "suspended" | "revoked";
  expiresInDays: number | null;
  userAgentHint: string | null;
  lastUsedDaysAgo: number | null;
  callCount: number;
}

const FOLDERS: SeedFolder[] = [
  {
    id: "fld_seed_cloud",
    slug: "cloud-infra",
    name: "云基础设施",
    description: "Cloudflare、DNS 与对象存储访问凭证",
    color: "amber",
    sortOrder: 1,
  },
  {
    id: "fld_seed_vcs",
    slug: "vcs-ci",
    name: "代码与 CI/CD",
    description: "GitHub、npm 与自动化流水线令牌",
    color: "blue",
    sortOrder: 2,
  },
  {
    id: "fld_seed_llm",
    slug: "ai-models",
    name: "大模型 API",
    description: "Gemini、OpenAI、Anthropic 等推理服务密钥",
    color: "teal",
    sortOrder: 3,
  },
  {
    id: "fld_seed_data",
    slug: "databases",
    name: "数据与缓存",
    description: "PostgreSQL、Redis 与分析数据库只读凭证",
    color: "violet",
    sortOrder: 4,
  },
  {
    id: "fld_seed_pay",
    slug: "billing-webhooks",
    name: "支付与 Webhook",
    description: "Stripe 沙箱与通知签名密钥",
    color: "rose",
    sortOrder: 5,
  },
  {
    id: "fld_seed_ops",
    slug: "observability",
    name: "监控与告警",
    description: "Sentry、Grafana 与 Uptime 探针凭据",
    color: "slate",
    sortOrder: 6,
  },
];

const SECRETS: SeedSecret[] = [
  {
    id: "sec_seed_01",
    folderId: "fld_seed_cloud",
    slug: "cf-dns-readonly",
    name: "Cloudflare DNS 只读令牌",
    service: "cloudflare",
    description: "查询个人域名 DNS 解析与 SSL 状态",
    tags: ["dns", "readonly", "edge"],
    metadata: { account: "personal", scope: "zone:dns:read" },
    plaintext: "sqdemo_cf_dns_readonly_01_example_9482",
    isEnabled: true,
    expiresInDays: 120,
    lastUsedDaysAgo: 0,
    createdDaysAgo: 60,
    useCount: 428,
  },
  {
    id: "sec_seed_02",
    folderId: "fld_seed_cloud",
    slug: "cf-workers-deploy-ci-token",
    name: "Cloudflare Workers 部署与 D1 迁移高权限凭证（生产流水线专用）",
    service: "cloudflare",
    description: "CI 自动发布 Worker 与执行 D1 迁移",
    tags: ["workers", "d1", "ci"],
    metadata: { env: "production" },
    plaintext: "sqdemo_cf_workers_deploy_02_example_7731",
    isEnabled: true,
    expiresInDays: 14,
    lastUsedDaysAgo: 1,
    createdDaysAgo: 55,
    useCount: 196,
  },
  {
    id: "sec_seed_03",
    folderId: "fld_seed_cloud",
    slug: "r2-backup-bucket-key",
    name: "R2 备份存储桶访问密钥",
    service: "cloudflare-r2",
    description: "每日快照归档读取与上传",
    tags: ["r2", "backup"],
    metadata: { bucket: "nocoo-backups" },
    plaintext: "sqdemo_cf_r2_backup_03_example_5120",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 2,
    createdDaysAgo: 80,
    useCount: 84,
  },
  {
    id: "sec_seed_04",
    folderId: "fld_seed_cloud",
    slug: "cf-tunnel-legacy-token",
    name: "旧版 Cloudflared 隧道令牌",
    service: "cloudflare",
    description: "已迁移至新网关的备用隧道凭证",
    tags: ["tunnel", "legacy"],
    metadata: {},
    plaintext: "sqdemo_cf_tunnel_legacy_04_example_3309",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 105,
    createdDaysAgo: 150,
    useCount: 12,
  },
  {
    id: "sec_seed_05",
    folderId: "fld_seed_vcs",
    slug: "github-personal-repos-pat",
    name: "GitHub 个人仓库读写 PAT",
    service: "github",
    description: "读取 Issue、PR 审查与分支状态",
    tags: ["git", "pr", "issues"],
    metadata: { owner: "nocoo" },
    plaintext: "sqdemo_gh_pat_repos_05_example_6614",
    isEnabled: true,
    expiresInDays: 90,
    lastUsedDaysAgo: 0,
    createdDaysAgo: 45,
    useCount: 315,
  },
  {
    id: "sec_seed_06",
    folderId: "fld_seed_vcs",
    slug: "github-packages-publish",
    name: "GitHub Packages 发布令牌",
    service: "github",
    description: "发布 @nocoo 作用域私有 npm 包",
    tags: ["npm", "packages"],
    metadata: { scope: "@nocoo" },
    plaintext: "sqdemo_gh_pkg_publish_06_example_1948",
    isEnabled: true,
    expiresInDays: 7,
    lastUsedDaysAgo: 3,
    createdDaysAgo: 83,
    useCount: 62,
  },
  {
    id: "sec_seed_07",
    folderId: "fld_seed_vcs",
    slug: "npm-mirror-automation",
    name: "NPM 自动化发布 Token",
    service: "npm",
    description: "CI 推送 @nocoo/basalt 正式版",
    tags: ["npm", "release"],
    metadata: { registry: "https://registry.npmjs.org" },
    plaintext: "sqdemo_gh_npm_auto_07_example_8820",
    isEnabled: true,
    expiresInDays: 21,
    lastUsedDaysAgo: 5,
    createdDaysAgo: 69,
    useCount: 41,
  },
  {
    id: "sec_seed_08",
    folderId: "fld_seed_vcs",
    slug: "gitlab-mirror-sync",
    name: "GitLab 镜像同步只读令牌",
    service: "gitlab",
    description: "同步历史归档仓库元数据",
    tags: ["mirror", "archive"],
    metadata: {},
    plaintext: "sqdemo_gh_gitlab_sync_08_example_4012",
    isEnabled: false,
    expiresInDays: null,
    lastUsedDaysAgo: 40,
    createdDaysAgo: 120,
    useCount: 9,
  },
  {
    id: "sec_seed_09",
    folderId: "fld_seed_llm",
    slug: "gemini-ai-studio-prod",
    name: "Gemini AI Studio 推理 Key",
    service: "gemini",
    description: "本地 Agent 与脚本调用 Gemini 模型",
    tags: ["llm", "gemini", "prod"],
    metadata: { tier: "paid" },
    plaintext: "sqdemo_ai_gemini_prod_09_example_7745",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 0,
    createdDaysAgo: 70,
    useCount: 389,
  },
  {
    id: "sec_seed_10",
    folderId: "fld_seed_llm",
    slug: "openai-eval-runner",
    name: "OpenAI 评测脚本 API Key",
    service: "openai",
    description: "运行回归基准与结构化输出测试",
    tags: ["llm", "eval"],
    metadata: { project: "squirrel-eval" },
    plaintext: "sqdemo_ai_openai_eval_10_example_2291",
    isEnabled: true,
    expiresInDays: 60,
    lastUsedDaysAgo: 1,
    createdDaysAgo: 50,
    useCount: 154,
  },
  {
    id: "sec_seed_11",
    folderId: "fld_seed_llm",
    slug: "anthropic-claude-cli",
    name: "Anthropic Claude Code CLI 密钥",
    service: "anthropic",
    description: "终端辅助编程与代码审计",
    tags: ["llm", "claude", "cli"],
    metadata: {},
    plaintext: "sqdemo_ai_claude_cli_11_example_9034",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 2,
    createdDaysAgo: 40,
    useCount: 211,
  },
  {
    id: "sec_seed_12",
    folderId: "fld_seed_llm",
    slug: "openrouter-fallback-key",
    name: "OpenRouter 多模型兜底凭证",
    service: "openrouter",
    description: "主通道限流时的备用路由密钥",
    tags: ["llm", "fallback"],
    metadata: {},
    plaintext: "sqdemo_ai_openrouter_12_example_5501",
    isEnabled: true,
    expiresInDays: -5,
    lastUsedDaysAgo: 18,
    createdDaysAgo: 110,
    useCount: 27,
  },
  {
    id: "sec_seed_13",
    folderId: "fld_seed_data",
    slug: "neon-pg-analytics-ro",
    name: "Neon PostgreSQL 只读分析串",
    service: "postgres",
    description: "BI 报表与只读 SQL 诊断查询",
    tags: ["sql", "readonly", "analytics"],
    metadata: { host: "ep-cool-forest.us-east-2.aws.neon.tech" },
    plaintext: "sqdemo_db_neon_ro_13_example_6187",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 1,
    createdDaysAgo: 65,
    useCount: 132,
  },
  {
    id: "sec_seed_14",
    folderId: "fld_seed_data",
    slug: "upstash-redis-cache",
    name: "Upstash Redis 速率限制令牌",
    service: "redis",
    description: "边缘限流与会话缓存写入",
    tags: ["redis", "ratelimit"],
    metadata: { region: "ap-northeast-1" },
    plaintext: "sqdemo_db_upstash_14_example_3490",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 4,
    createdDaysAgo: 75,
    useCount: 73,
  },
  {
    id: "sec_seed_15",
    folderId: "fld_seed_data",
    slug: "turso-legacy-replica",
    name: "Turso 历史副本只读 Token",
    service: "turso",
    description: "迁移前 SQLite 归档库只读验证",
    tags: ["sqlite", "archive"],
    metadata: {},
    plaintext: "sqdemo_db_turso_15_example_8123",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 118,
    createdDaysAgo: 140,
    useCount: 6,
  },
  {
    id: "sec_seed_16",
    folderId: "fld_seed_pay",
    slug: "stripe-sandbox-restricted",
    name: "Stripe 沙箱受限测试 Key",
    service: "stripe",
    description: "联调订阅计费与支付回调测试",
    tags: ["billing", "sandbox"],
    metadata: { mode: "test" },
    plaintext: "sqdemo_pay_stripe_16_example_4920",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 6,
    createdDaysAgo: 50,
    useCount: 48,
  },
  {
    id: "sec_seed_17",
    folderId: "fld_seed_pay",
    slug: "paddle-webhook-signing",
    name: "Paddle Webhook 验签密钥",
    service: "paddle",
    description: "校验订单状态变更事件签名",
    tags: ["webhook", "signature"],
    metadata: {},
    plaintext: "sqdemo_pay_paddle_17_example_1058",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 11,
    createdDaysAgo: 62,
    useCount: 19,
  },
  {
    id: "sec_seed_18",
    folderId: "fld_seed_pay",
    slug: "lemonsqueezy-deprecated",
    name: "LemonSqueezy 旧商户凭证",
    service: "lemonsqueezy",
    description: "历史订单对账专用（已下线）",
    tags: ["billing", "deprecated"],
    metadata: {},
    plaintext: "sqdemo_pay_lemon_18_example_7394",
    isEnabled: false,
    expiresInDays: null,
    lastUsedDaysAgo: 70,
    createdDaysAgo: 130,
    useCount: 4,
  },
  {
    id: "sec_seed_19",
    folderId: "fld_seed_ops",
    slug: "sentry-auth-sourcemap",
    name: "Sentry SourceMap 上传令牌",
    service: "sentry",
    description: "构建后自动推送前端调试符号",
    tags: ["sentry", "sourcemap"],
    metadata: { org: "hexly" },
    plaintext: "sqdemo_hook_sentry_19_example_2847",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 2,
    createdDaysAgo: 88,
    useCount: 95,
  },
  {
    id: "sec_seed_20",
    folderId: "fld_seed_ops",
    slug: "grafana-cloud-metrics-ro",
    name: "Grafana Cloud 指标查询 Key",
    service: "grafana",
    description: "巡检脚本拉取 Prometheus P99 延迟",
    tags: ["metrics", "prometheus"],
    metadata: {},
    plaintext: "sqdemo_hook_grafana_20_example_6419",
    isEnabled: true,
    expiresInDays: 180,
    lastUsedDaysAgo: 3,
    createdDaysAgo: 42,
    useCount: 57,
  },
  {
    id: "sec_seed_21",
    folderId: "fld_seed_ops",
    slug: "pagerduty-legacy-webhook",
    name: "PagerDuty 早期告警集成 Key",
    service: "pagerduty",
    description: "旧值班路由规则凭证，待清理",
    tags: ["alert", "legacy"],
    metadata: {},
    plaintext: "sqdemo_hook_pager_21_example_9502",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: null,
    createdDaysAgo: 112,
    useCount: 0,
  },
  {
    id: "sec_seed_22",
    folderId: null,
    slug: "telegram-alert-bot",
    name: "Telegram 私人通知 Bot Token",
    service: "telegram",
    description: "向个人频道推送部署与告警消息",
    tags: ["bot", "notify"],
    metadata: { chat: "ops-alerts" },
    plaintext: "sqdemo_hook_tg_22_example_3176",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 1,
    createdDaysAgo: 35,
    useCount: 108,
  },
  {
    id: "sec_seed_23",
    folderId: null,
    slug: "resend-transactional-mail",
    name: "Resend 事务邮件发送密钥",
    service: "resend",
    description: "发送系统提醒与验证码邮件",
    tags: ["email", "smtp"],
    metadata: { domain: "hexly.ai" },
    plaintext: "sqdemo_hook_resend_23_example_5840",
    isEnabled: true,
    expiresInDays: 25,
    lastUsedDaysAgo: 7,
    createdDaysAgo: 48,
    useCount: 33,
  },
  {
    id: "sec_seed_24",
    folderId: null,
    slug: "tailscale-ephemeral-auth-key-long-slug-check",
    name: "Tailscale 临时节点注册密钥（长名称截断验证样本）",
    service: "tailscale",
    description: "动态拉起临时调试容器加入 Tailnet",
    tags: ["vpn", "ephemeral"],
    metadata: {},
    plaintext: "sqdemo_hook_ts_24_example_7029",
    isEnabled: true,
    expiresInDays: null,
    lastUsedDaysAgo: 9,
    createdDaysAgo: 20,
    useCount: 15,
  },
];

const CLIENTS: SeedClient[] = [
  {
    clientId: "dcr_gemini_personal_01",
    displayName: "Gemini 个人工作区",
    registrationType: "dcr",
    allowAll: false,
    allowedFolderIds: ["fld_seed_cloud", "fld_seed_llm"],
    allowedSecretIds: ["sec_seed_22"],
    allowPlaintextRead: true,
    status: "active",
    expiresInDays: null,
    userAgentHint: "Gemini-MCP-Client/2.4",
    lastUsedDaysAgo: 0,
    callCount: 184,
  },
  {
    clientId: "dcr_claude_code_m4",
    displayName: "Claude Code MacBook Pro",
    registrationType: "dcr",
    allowAll: true,
    allowedFolderIds: [],
    allowedSecretIds: [],
    allowPlaintextRead: true,
    status: "active",
    expiresInDays: null,
    userAgentHint: "claude-code/1.0",
    lastUsedDaysAgo: 0,
    callCount: 268,
  },
  {
    clientId: "static_cursor_ide_03",
    displayName: "Cursor IDE 本地助手",
    registrationType: "static_oauth",
    allowAll: false,
    allowedFolderIds: ["fld_seed_vcs", "fld_seed_data"],
    allowedSecretIds: [],
    allowPlaintextRead: true,
    status: "active",
    expiresInDays: null,
    userAgentHint: "Cursor/0.48",
    lastUsedDaysAgo: 1,
    callCount: 92,
  },
  {
    clientId: "bot_ci_patrol_04",
    displayName: "Cloudflare 每日巡检 Bot",
    registrationType: "bot_token",
    rawToken: "sq_live_seed_bot_patrol_04_example_token_value",
    allowAll: false,
    allowedFolderIds: ["fld_seed_cloud", "fld_seed_ops"],
    allowedSecretIds: ["sec_seed_22"],
    allowPlaintextRead: true,
    status: "active",
    expiresInDays: 75,
    userAgentHint: "cf-patrol-runner/1.2",
    lastUsedDaysAgo: 0,
    callCount: 141,
  },
  {
    clientId: "bot_inventory_ro_05",
    displayName: "资产盘点只读 Agent",
    registrationType: "bot_token",
    rawToken: "sq_live_seed_bot_inventory_05_example_token_value",
    allowAll: false,
    allowedFolderIds: ["fld_seed_vcs", "fld_seed_pay"],
    allowedSecretIds: [],
    allowPlaintextRead: false,
    status: "suspended",
    expiresInDays: 30,
    userAgentHint: "inventory-sync/0.9",
    lastUsedDaysAgo: 9,
    callCount: 28,
  },
  {
    clientId: "bot_legacy_cron_06",
    displayName: "已下线构建通知脚本",
    registrationType: "bot_token",
    rawToken: "sq_live_seed_bot_legacy_06_example_token_value",
    allowAll: false,
    allowedFolderIds: ["fld_seed_ops"],
    allowedSecretIds: [],
    allowPlaintextRead: false,
    status: "revoked",
    expiresInDays: null,
    userAgentHint: "github-actions/v4",
    lastUsedDaysAgo: 38,
    callCount: 47,
  },
];

const REASONS = [
  "检查 hexly.ai 主域名 DNS 解析记录是否生效",
  "拉取 GitHub PR #48 审查状态与 CI 构建结果",
  "调用 Gemini 2.5 Pro 生成每周巡检摘要报告",
  "查询 Neon 分析库昨日接口错误率统计",
  "验证 Stripe 测试环境 Webhook 签名与回调载荷",
  "推送构建后前端 SourceMap 到 Sentry Release",
  "发送每日巡检告警摘要到 Telegram ops-alerts 频道",
  "验证 Cloudflare Workers 路由配置与 KV 命名空间列表，并核对生产环境灰度策略是否符合预期",
];

async function main() {
  const masterKey = await computeLocalMasterKey();
  const nowMs = Date.now();
  const isoDaysAgo = (days: number, extraMinutes = 0) =>
    new Date(nowMs - days * 86_400_000 - extraMinutes * 60_000).toISOString();
  const isoDaysAhead = (days: number) => new Date(nowMs + days * 86_400_000).toISOString();

  const statements: string[] = [
    "DELETE FROM audit_logs;",
    "DELETE FROM oauth_client_policies;",
    "DELETE FROM secrets;",
    "DELETE FROM folders;",
  ];

  for (const folder of FOLDERS) {
    const ts = isoDaysAgo(90);
    statements.push(
      `INSERT INTO folders (id, slug, name, description, color, sort_order, created_at, updated_at) VALUES (${sqlEscape(folder.id)}, ${sqlEscape(folder.slug)}, ${sqlEscape(folder.name)}, ${sqlEscape(folder.description)}, ${sqlEscape(folder.color)}, ${folder.sortOrder}, ${sqlEscape(ts)}, ${sqlEscape(ts)});`,
    );
  }

  for (const secret of SECRETS) {
    const encrypted = await encryptSecret(secret.plaintext, secret.id, masterKey);
    const preview = maskSecretValue(secret.plaintext);
    const createdAt = isoDaysAgo(secret.createdDaysAgo);
    const updatedAt = isoDaysAgo(Math.min(secret.createdDaysAgo, 3));
    const lastUsedAt =
      secret.lastUsedDaysAgo !== null ? isoDaysAgo(secret.lastUsedDaysAgo, 15) : null;
    const expiresAt = secret.expiresInDays !== null ? isoDaysAhead(secret.expiresInDays) : null;

    statements.push(
      `INSERT INTO secrets (id, folder_id, slug, name, service, description, tags_json, metadata_json, masked_preview, ciphertext, iv, key_version, is_enabled, expires_at, last_used_at, use_count, created_at, updated_at) VALUES (${sqlEscape(secret.id)}, ${sqlEscape(secret.folderId)}, ${sqlEscape(secret.slug)}, ${sqlEscape(secret.name)}, ${sqlEscape(secret.service)}, ${sqlEscape(secret.description)}, ${sqlEscape(JSON.stringify(secret.tags))}, ${sqlEscape(JSON.stringify(secret.metadata))}, ${sqlEscape(preview)}, ${sqlEscape(encrypted.ciphertext)}, ${sqlEscape(encrypted.iv)}, 1, ${secret.isEnabled ? 1 : 0}, ${sqlEscape(expiresAt)}, ${sqlEscape(lastUsedAt)}, ${secret.useCount}, ${sqlEscape(createdAt)}, ${sqlEscape(updatedAt)});`,
    );
  }

  for (const client of CLIENTS) {
    const tokenHash = client.rawToken ? await sha256Hex(client.rawToken) : null;
    const tokenPreview = client.rawToken ? maskBotToken(client.rawToken) : null;
    const createdAt = isoDaysAgo(45);
    const updatedAt = isoDaysAgo(1);
    const lastUsedAt =
      client.lastUsedDaysAgo !== null ? isoDaysAgo(client.lastUsedDaysAgo, 8) : null;
    const expiresAt = client.expiresInDays !== null ? isoDaysAhead(client.expiresInDays) : null;

    statements.push(
      `INSERT INTO oauth_client_policies (client_id, display_name, registration_type, token_hash, token_preview, allow_all, allowed_folder_ids_json, allowed_secret_ids_json, allow_plaintext_read, status, expires_at, user_agent_hint, last_used_at, call_count, created_at, updated_at) VALUES (${sqlEscape(client.clientId)}, ${sqlEscape(client.displayName)}, ${sqlEscape(client.registrationType)}, ${sqlEscape(tokenHash)}, ${sqlEscape(tokenPreview)}, ${client.allowAll ? 1 : 0}, ${sqlEscape(JSON.stringify(client.allowedFolderIds))}, ${sqlEscape(JSON.stringify(client.allowedSecretIds))}, ${client.allowPlaintextRead ? 1 : 0}, ${sqlEscape(client.status)}, ${sqlEscape(expiresAt)}, ${sqlEscape(client.userAgentHint)}, ${sqlEscape(lastUsedAt)}, ${client.callCount}, ${sqlEscape(createdAt)}, ${sqlEscape(updatedAt)});`,
    );
  }

  // Generate 360 deterministic audit logs spanning the past 60 days
  const tools = [
    "get_secret",
    "get_secret",
    "get_secret",
    "list_secrets",
    "search_secrets",
    "whoami",
    "admin_reveal",
  ] as const;

  for (let i = 0; i < 360; i++) {
    // Cluster ~260 logs in the last 30 days and ~100 in days 30..59 so 7/14/30d comparisons look rich
    const daysAgo =
      i < 120 ? i % 7 : i < 210 ? 7 + (i % 7) : i < 290 ? 14 + (i % 16) : 30 + (i % 30);
    const minutesOffset = (i * 37) % 1380;
    const createdAt = isoDaysAgo(daysAgo, minutesOffset);
    const toolName = tools[i % tools.length] ?? "get_secret";

    const isAdmin = toolName === "admin_reveal";
    const client = CLIENTS[i % CLIENTS.length] ?? CLIENTS[0];
    const clientId = isAdmin ? "admin" : client.clientId;
    const clientName = isAdmin ? "developer@example.test" : client.displayName;

    const secret = SECRETS[(i * 5) % SECRETS.length] ?? SECRETS[0];
    const needsSecret = toolName === "get_secret" || toolName === "admin_reveal";
    const secretId = needsSecret ? secret.id : null;
    const secretSlug = needsSecret ? secret.slug : null;

    let decision = "allowed";
    let errorCode: string | null = null;
    if (!isAdmin && i % 13 === 0) {
      const denyVariants = [
        ["denied", "ACCESS_DENIED"],
        ["expired", "SECRET_EXPIRED"],
        ["disabled", "SECRET_DISABLED"],
        ["not_found", "SECRET_NOT_FOUND"],
      ] as const;
      const picked = denyVariants[(i / 13) % denyVariants.length] ?? denyVariants[0];
      decision = picked[0];
      errorCode = picked[1];
    }

    const reason = isAdmin
      ? "管理员后台手动查看明文"
      : (REASONS[i % REASONS.length] ?? "MCP 工具查询");
    const latencyMs = 4 + ((i * 11) % 78);
    const userAgent = isAdmin ? "Mozilla/5.0" : client.userAgentHint;

    statements.push(
      `INSERT INTO audit_logs (client_id, client_name, tool_name, secret_id, secret_slug, reason, decision, error_code, user_agent, cf_ray, latency_ms, created_at) VALUES (${sqlEscape(clientId)}, ${sqlEscape(clientName)}, ${sqlEscape(toolName)}, ${sqlEscape(secretId)}, ${sqlEscape(secretSlug)}, ${sqlEscape(reason)}, ${sqlEscape(decision)}, ${sqlEscape(errorCode)}, ${sqlEscape(userAgent)}, ${sqlEscape(`seedray_${String(i).padStart(4, "0")}`)}, ${latencyMs}, ${sqlEscape(createdAt)});`,
    );
  }

  const sqlPath = join(tmpdir(), `squirrel-seed-${Date.now()}.sql`);
  writeFileSync(sqlPath, `${statements.join("\n")}\n`, "utf8");

  try {
    execFileSync(
      "bunx",
      ["wrangler", "d1", "execute", "DB", "--local", "--env", "local", "--file", sqlPath],
      { stdio: "inherit" },
    );
    console.log(
      `Seeded local D1: ${FOLDERS.length} folders, ${SECRETS.length} secrets, ${CLIENTS.length} clients, 360 audit logs.`,
    );
  } finally {
    rmSync(sqlPath, { force: true });
  }
}

void main();

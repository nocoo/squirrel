import { Badge, Button, LayerCard, SegmentControl, Text } from "@nocoo/basalt";
import {
  AXIS_CONFIG,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  ChartTooltipRow,
  GRID_PROPS,
  getChartColor,
} from "@nocoo/basalt/components/chart";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { StatCard, StatGrid } from "@nocoo/basalt/components/stat-card";
import {
  Activity,
  AlertTriangle,
  Bot,
  Folder,
  KeyRound,
  RefreshCw,
  ShieldAlert,
} from "@nocoo/basalt/icons";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime } from "@/models/format";
import { useDashboardViewModel } from "@/viewmodels/useDashboardViewModel";

export default function DashboardPage() {
  const { days, setDays, stats, chartData, allowRate, loading, error, reload } =
    useDashboardViewModel();

  const summary = stats?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="概览"
        description="Squirrel 密钥托管状态、消费方调用趋势与安全预警"
        actions={
          <div className="flex items-center gap-2">
            <SegmentControl
              value={String(days)}
              onValueChange={(val) => {
                if (val === "7" || val === "14" || val === "30") {
                  setDays(Number(val) as 7 | 14 | 30);
                }
              }}
              options={[
                { value: "7", label: "近 7 天" },
                { value: "14", label: "近 14 天" },
                { value: "30", label: "近 30 天" },
              ]}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              刷新
            </Button>
          </div>
        }
      />

      {error && (
        <LayerCard outlined>
          <LayerCard.Body className="flex items-center justify-between gap-4">
            <Text className="text-basalt-base text-basalt-destructive">{error}</Text>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              重试
            </Button>
          </LayerCard.Body>
        </LayerCard>
      )}

      <SectionRule title="核心指标" hint="实时反映 D1 密钥库、客户端策略与审计记录" />
      <StatGrid columns={3}>
        <StatCard
          title="托管密钥"
          value={summary?.totalSecrets ?? 0}
          subtitle={`已启用 ${summary?.enabledSecrets ?? 0} 个 · ${summary?.totalFolders ?? 0} 个文件夹`}
          icon={<KeyRound className="h-4 w-4" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title="活跃消费方"
          value={summary?.activeClients ?? 0}
          subtitle="含 OAuth 2.1 与无头 Bot Token"
          icon={<Bot className="h-4 w-4" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title={`近 ${days} 日调用`}
          value={summary?.totalCalls ?? 0}
          subtitle={`放行率 ${allowRate}（${summary?.allowedCalls ?? 0} 次放行）`}
          icon={<Activity className="h-4 w-4" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title={`近 ${days} 日拒绝`}
          value={summary?.deniedCalls ?? 0}
          subtitle="越权、停用或已过期拦截"
          icon={<ShieldAlert className="h-4 w-4" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title="30 天内临期"
          value={summary?.expiringSoonCount ?? 0}
          subtitle="建议及时轮换临期凭证"
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title="文件夹数量"
          value={summary?.totalFolders ?? 0}
          subtitle="按文件夹粒度隔离授权范围"
          icon={<Folder className="h-4 w-4" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
      </StatGrid>

      <SectionRule title="调用趋势" hint="每日放行与拒绝的 MCP 工具调用与后台明文查看次数" />
      <LayerCard>
        <LayerCard.Header>
          <LayerCard.Title>每日调用分布</LayerCard.Title>
          <LayerCard.Description>近 {days} 天放行 vs 拒绝次数统计</LayerCard.Description>
        </LayerCard.Header>
        <LayerCard.Body>
          {loading && !stats ? (
            <LayerCard.Loading label="加载趋势图..." />
          ) : (
            <ChartFrame
              ariaLabel={`近 ${days} 天调用趋势柱状图`}
              size="md"
              summary={`共 ${summary?.totalCalls ?? 0} 次调用，放行 ${summary?.allowedCalls ?? 0} 次，拒绝 ${summary?.deniedCalls ?? 0} 次。`}
              legend={
                <ChartLegend
                  items={[
                    { key: "allowed", label: "放行", color: getChartColor(0) },
                    { key: "denied", label: "拒绝 / 异常", color: getChartColor(1) },
                  ]}
                />
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={chartData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_CONFIG} />
                  <YAxis allowDecimals={false} {...AXIS_CONFIG} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <ChartTooltip>
                          <div className="mb-1 text-basalt-sm font-medium">{String(label)}</div>
                          {payload.map((entry) => (
                            <ChartTooltipRow
                              key={String(entry.dataKey)}
                              label={entry.name === "allowed" ? "放行" : "拒绝"}
                              value={Number(entry.value ?? 0)}
                              color={entry.color}
                            />
                          ))}
                        </ChartTooltip>
                      );
                    }}
                  />
                  <Bar
                    dataKey="allowed"
                    name="allowed"
                    fill={getChartColor(0)}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="denied"
                    name="denied"
                    fill={getChartColor(1)}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </RechartsBarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </LayerCard.Body>
      </LayerCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <LayerCard>
          <LayerCard.Header>
            <LayerCard.Title>高频密钥 Top 10</LayerCard.Title>
            <LayerCard.Description>按累计读取次数排序</LayerCard.Description>
          </LayerCard.Header>
          <LayerCard.Body>
            {!stats || stats.topSecrets.length === 0 ? (
              <LayerCard.Empty title="暂无读取记录" description="密钥被读取后将在此显示排名" />
            ) : (
              <div className="space-y-2">
                {stats.topSecrets.map((item) => (
                  <LayerCard.Well
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Text className="truncate text-basalt-base font-medium">{item.name}</Text>
                      <Text className="truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                        {item.slug} · {item.service}
                      </Text>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="info" variant="soft" className="tabular-nums">
                        {item.useCount} 次
                      </Badge>
                    </div>
                  </LayerCard.Well>
                ))}
              </div>
            )}
          </LayerCard.Body>
        </LayerCard>

        <LayerCard>
          <LayerCard.Header>
            <LayerCard.Title>临期与僵尸密钥提醒</LayerCard.Title>
            <LayerCard.Description>30 天内过期或超过 90 天未使用的启用密钥</LayerCard.Description>
          </LayerCard.Header>
          <LayerCard.Body>
            {!stats ||
            (stats.expiringSoonSecrets.length === 0 && stats.staleSecrets.length === 0) ? (
              <LayerCard.Empty title="状态健康" description="暂无临期或长期未用的僵尸密钥" />
            ) : (
              <div className="space-y-2">
                {stats.expiringSoonSecrets.map((item) => (
                  <LayerCard.Well
                    key={`exp-${item.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Text className="truncate text-basalt-base font-medium">{item.name}</Text>
                      <Text className="truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                        {item.slug}
                      </Text>
                    </div>
                    <Badge tone="warning" variant="soft">
                      过期：{item.expiresAt.slice(0, 10)}
                    </Badge>
                  </LayerCard.Well>
                ))}
                {stats.staleSecrets.map((item) => (
                  <LayerCard.Well
                    key={`stale-${item.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Text className="truncate text-basalt-base font-medium">{item.name}</Text>
                      <Text className="truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                        最近读取：{formatDateTime(item.lastUsedAt)}
                      </Text>
                    </div>
                    <Badge tone="neutral" variant="outline">
                      超过 90 天未用
                    </Badge>
                  </LayerCard.Well>
                ))}
              </div>
            )}
          </LayerCard.Body>
        </LayerCard>
      </div>
    </div>
  );
}

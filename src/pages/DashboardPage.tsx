import { Badge, Button, LayerCard, Meter, SegmentControl, Skeleton, Text } from "@nocoo/basalt";
import {
  AXIS_CONFIG,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  ChartTooltipDivider,
  ChartTooltipRow,
  ChartTooltipSummary,
  GRID_PROPS,
  getChartColor,
} from "@nocoo/basalt/components/chart";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { StatCard, StatGrid } from "@nocoo/basalt/components/stat-card";
import { Activity, Bot, KeyRound, RefreshCw, ShieldAlert } from "@nocoo/basalt/icons";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorBanner } from "@/components/ErrorBanner";
import { computeAllowRate } from "@/models/dashboard";
import { formatDateTime } from "@/models/format";
import { useDashboardViewModel } from "@/viewmodels/useDashboardViewModel";

export default function DashboardPage() {
  const {
    days,
    setDays,
    stats,
    chartData,
    allowRate,
    allowRateValue,
    callsDelta,
    deniedDelta,
    loading,
    error,
    reload,
  } = useDashboardViewModel();

  const summary = stats?.summary;
  const expiringCount = stats?.expiringSoonSecrets.length ?? 0;
  const staleCount = stats?.staleSecrets.length ?? 0;

  return (
    <div className="space-y-basalt-layout-lg">
      <PageHeader
        title="概览"
        description="Squirrel 密钥托管状态、消费方调用趋势与安全预警"
        actions={
          <div className="flex w-full items-center justify-between gap-basalt-space-lg sm:w-auto sm:justify-end">
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
              <RefreshCw className="size-basalt-icon-lg" strokeWidth={1.5} />
              刷新
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

      <SectionRule title="核心指标" hint="实时反映 D1 密钥库、客户端策略与审计记录" />
      <StatGrid columns={4}>
        <StatCard
          title="托管密钥"
          value={summary?.totalSecrets ?? 0}
          subtitle={`已启用 ${summary?.enabledSecrets ?? 0} · ${summary?.totalFolders ?? 0} 文件夹`}
          icon={<KeyRound className="size-basalt-icon-lg" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title="活跃消费方"
          value={summary?.activeClients ?? 0}
          subtitle="OAuth 2.1 与 Bot 凭证"
          icon={<Bot className="size-basalt-icon-lg" strokeWidth={1.5} />}
          loading={loading && !stats}
        />
        <StatCard
          title={`近 ${days} 日调用`}
          value={summary?.totalCalls ?? 0}
          subtitle={`放行 ${summary?.allowedCalls ?? 0} 次 · 放行率 ${allowRate}`}
          icon={<Activity className="size-basalt-icon-lg" strokeWidth={1.5} />}
          trend={callsDelta !== null ? { value: callsDelta, label: `较前 ${days} 天` } : undefined}
          loading={loading && !stats}
        >
          {allowRateValue !== null ? (
            <Meter
              value={allowRateValue}
              size="sm"
              hideValue
              tone={allowRateValue >= 90 ? "success" : allowRateValue >= 70 ? "warning" : "danger"}
              aria-label="放行率"
            />
          ) : null}
        </StatCard>
        <StatCard
          title={`近 ${days} 日拒绝`}
          value={summary?.deniedCalls ?? 0}
          subtitle="越权、停用或过期拦截"
          icon={<ShieldAlert className="size-basalt-icon-lg" strokeWidth={1.5} />}
          trendContent={
            deniedDelta !== null ? (
              <>
                <span
                  className={`font-medium tabular-nums ${
                    deniedDelta > 0
                      ? "text-basalt-danger-solid"
                      : deniedDelta < 0
                        ? "text-basalt-success"
                        : "text-basalt-muted-foreground"
                  }`}
                >
                  {deniedDelta > 0 ? "+" : ""}
                  {deniedDelta}%
                </span>
                <span className="text-basalt-muted-foreground">较前 {days} 天</span>
              </>
            ) : undefined
          }
          loading={loading && !stats}
        />
      </StatGrid>

      <SectionRule title="调用趋势" hint="每日放行与拒绝的 MCP 工具调用与后台明文查看次数" />
      <LayerCard>
        <LayerCard.Header>
          <div className="min-w-0 space-y-basalt-space-xs">
            <LayerCard.Title>每日调用分布</LayerCard.Title>
            <LayerCard.Description>近 {days} 天放行 vs 拒绝次数统计</LayerCard.Description>
          </div>
        </LayerCard.Header>
        <LayerCard.Body>
          {loading && !stats ? (
            <div role="status" aria-label="加载趋势图..." className="space-y-basalt-layout-sm">
              <div className="flex items-center gap-basalt-layout">
                <Skeleton width={56} height={14} />
                <Skeleton width={76} height={14} />
              </div>
              <Skeleton variant="block" className="h-basalt-56" />
            </div>
          ) : (summary?.totalCalls ?? 0) === 0 ? (
            <LayerCard.Empty
              icon={
                <Activity
                  className="size-basalt-icon-display text-basalt-muted-foreground"
                  strokeWidth={1.5}
                />
              }
              title={`近 ${days} 天暂无调用`}
              description="消费方通过 /mcp 访问密钥或后台查看明文后将在此展示趋势"
            />
          ) : (
            <ChartFrame
              ariaLabel={`近 ${days} 天调用趋势柱状图`}
              size="md"
              summary={`共 ${summary?.totalCalls ?? 0} 次调用，放行 ${summary?.allowedCalls ?? 0} 次，拒绝 ${summary?.deniedCalls ?? 0} 次。`}
              dataAlternative={
                <table className="sr-only">
                  <caption>近 {days} 天每日调用明细</caption>
                  <thead>
                    <tr>
                      <th scope="col">日期</th>
                      <th scope="col">放行</th>
                      <th scope="col">拒绝</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((point) => (
                      <tr key={point.date}>
                        <td>{point.date}</td>
                        <td>{point.allowed}</td>
                        <td>{point.denied}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
              legend={
                <ChartLegend
                  items={[
                    { key: "allowed", label: "放行", color: getChartColor(2) },
                    { key: "denied", label: "拒绝 / 异常", color: getChartColor(1) },
                  ]}
                />
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={chartData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" minTickGap={24} {...AXIS_CONFIG} />
                  <YAxis allowDecimals={false} {...AXIS_CONFIG} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const allowedVal = Number(
                        payload.find((e) => e.dataKey === "allowed")?.value ?? 0,
                      );
                      const deniedVal = Number(
                        payload.find((e) => e.dataKey === "denied")?.value ?? 0,
                      );
                      const dayTotal = allowedVal + deniedVal;
                      return (
                        <ChartTooltip>
                          <div className="mb-basalt-space-sm text-basalt-sm font-medium">
                            {String(label)}
                          </div>
                          {payload.map((entry) => (
                            <ChartTooltipRow
                              key={String(entry.dataKey)}
                              label={entry.name === "allowed" ? "放行" : "拒绝"}
                              value={Number(entry.value ?? 0)}
                              color={entry.color}
                            />
                          ))}
                          <ChartTooltipDivider />
                          <ChartTooltipSummary
                            label="合计 / 放行率"
                            value={`${dayTotal} 次 (${computeAllowRate(allowedVal, dayTotal)})`}
                          />
                        </ChartTooltip>
                      );
                    }}
                  />
                  <Bar
                    dataKey="allowed"
                    name="allowed"
                    fill={getChartColor(2)}
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

      <div className="grid gap-basalt-layout lg:grid-cols-2">
        <LayerCard>
          <LayerCard.Header>
            <div className="min-w-0 space-y-basalt-space-xs">
              <LayerCard.Title>高频密钥 Top 10</LayerCard.Title>
              <LayerCard.Description>按累计读取次数排序</LayerCard.Description>
            </div>
          </LayerCard.Header>
          <LayerCard.Body>
            {loading && !stats ? (
              <div role="status" aria-label="加载高频密钥..." className="space-y-basalt-space-lg">
                {Array.from({ length: 4 }, (_, idx) => (
                  <Skeleton key={idx} variant="block" height={48} />
                ))}
              </div>
            ) : !stats || stats.topSecrets.length === 0 ? (
              <LayerCard.Empty title="暂无读取记录" description="密钥被读取后将在此显示排名" />
            ) : (
              <div className="space-y-basalt-space-lg">
                {stats.topSecrets.map((item) => (
                  <LayerCard.Well
                    key={item.id}
                    className="flex items-center justify-between gap-basalt-layout-sm px-basalt-card-sm py-basalt-space-lg"
                  >
                    <div className="min-w-0">
                      <Text className="truncate text-basalt-base font-medium">{item.name}</Text>
                      <Text className="truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                        {item.slug} · {item.service}
                      </Text>
                    </div>
                    <div className="flex shrink-0 items-center gap-basalt-space-lg">
                      <Badge tone="info" variant="soft" className="whitespace-nowrap tabular-nums">
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
            <div className="min-w-0 space-y-basalt-space-xs">
              <LayerCard.Title>临期与僵尸密钥提醒</LayerCard.Title>
              <LayerCard.Description>30 天内过期或超过 90 天未使用的启用密钥</LayerCard.Description>
            </div>
            {(expiringCount > 0 || staleCount > 0) && (
              <div className="flex shrink-0 items-center gap-basalt-space-sm">
                {expiringCount > 0 && (
                  <Badge tone="warning" variant="soft" className="whitespace-nowrap tabular-nums">
                    临期 {expiringCount}
                  </Badge>
                )}
                {staleCount > 0 && (
                  <Badge
                    tone="neutral"
                    variant="outline"
                    className="whitespace-nowrap tabular-nums"
                  >
                    僵尸 {staleCount}
                  </Badge>
                )}
              </div>
            )}
          </LayerCard.Header>
          <LayerCard.Body>
            {loading && !stats ? (
              <div role="status" aria-label="加载密钥提醒..." className="space-y-basalt-space-lg">
                {Array.from({ length: 4 }, (_, idx) => (
                  <Skeleton key={idx} variant="block" height={48} />
                ))}
              </div>
            ) : !stats || (expiringCount === 0 && staleCount === 0) ? (
              <LayerCard.Empty title="状态健康" description="暂无临期或长期未用的僵尸密钥" />
            ) : (
              <div className="space-y-basalt-space-lg">
                {stats.expiringSoonSecrets.map((item) => (
                  <LayerCard.Well
                    key={`exp-${item.id}`}
                    className="flex items-center justify-between gap-basalt-layout-sm px-basalt-card-sm py-basalt-space-lg"
                  >
                    <div className="min-w-0">
                      <Text className="truncate text-basalt-base font-medium">{item.name}</Text>
                      <Text className="truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                        {item.slug}
                      </Text>
                    </div>
                    <Badge tone="warning" variant="soft" className="shrink-0 whitespace-nowrap">
                      过期：{item.expiresAt.slice(0, 10)}
                    </Badge>
                  </LayerCard.Well>
                ))}
                {stats.staleSecrets.map((item) => (
                  <LayerCard.Well
                    key={`stale-${item.id}`}
                    className="flex items-center justify-between gap-basalt-layout-sm px-basalt-card-sm py-basalt-space-lg"
                  >
                    <div className="min-w-0">
                      <Text className="truncate text-basalt-base font-medium">{item.name}</Text>
                      <Text className="truncate font-mono text-basalt-sm text-basalt-muted-foreground">
                        最近读取：{formatDateTime(item.lastUsedAt)}
                      </Text>
                    </div>
                    <Badge tone="neutral" variant="outline" className="shrink-0 whitespace-nowrap">
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

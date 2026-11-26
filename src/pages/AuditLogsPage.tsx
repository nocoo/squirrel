import { Badge, Button, LayerCard, Skeleton, TablePager } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { FilterBar, FilterChip } from "@nocoo/basalt/components/filter-bar";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nocoo/basalt/components/table";
import { Info, RefreshCw } from "@nocoo/basalt/icons";
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { ErrorBanner } from "@/components/ErrorBanner";
import { formatDateTime, getAuditDecisionMeta } from "@/models/format";
import type { AuditDecision } from "@/models/types";
import { useAuditLogsViewModel } from "@/viewmodels/useAuditLogsViewModel";

export default function AuditLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    logs,
    total,
    page,
    pageSize,
    setPage,
    clients,
    clientFilter,
    setClientFilter,
    decisionFilter,
    setDecisionFilter,
    toolFilter,
    setToolFilter,
    hasActiveFilters,
    clearFilters,
    loading,
    error,
    reload,
  } = useAuditLogsViewModel({
    client: searchParams.get("client") ?? undefined,
    tool: searchParams.get("tool") ?? undefined,
    decision: searchParams.get("decision") ?? undefined,
  });

  const syncParams = useCallback(
    (next: { client?: string; tool?: string; decision?: string }) => {
      const updated = new URLSearchParams();
      if (next.client && next.client !== "all") updated.set("client", next.client);
      if (next.tool && next.tool !== "all") updated.set("tool", next.tool);
      if (next.decision && next.decision !== "all") updated.set("decision", next.decision);
      setSearchParams(updated, { replace: true });
    },
    [setSearchParams],
  );

  const handleClientChange = (val: string) => {
    setClientFilter(val);
    syncParams({ client: val, tool: toolFilter, decision: decisionFilter });
  };

  const handleToolChange = (val: string) => {
    setToolFilter(val);
    syncParams({ client: clientFilter, tool: val, decision: decisionFilter });
  };

  const handleDecisionChange = (val: string) => {
    setDecisionFilter(val);
    syncParams({ client: clientFilter, tool: toolFilter, decision: val });
  };

  const handleClearFilters = () => {
    clearFilters();
    syncParams({});
  };

  const clientDisplayLabel =
    clientFilter === "admin"
      ? "管理员后台"
      : (clients.find((c) => c.clientId === clientFilter)?.displayName ?? clientFilter);

  const decisionLabel =
    decisionFilter !== "all"
      ? getAuditDecisionMeta(decisionFilter as AuditDecision).label
      : decisionFilter;

  return (
    <div className="space-y-basalt-layout-lg">
      <PageHeader
        title="审计日志"
        description="追踪每一次 MCP 工具调用、AI 声明原因、权限决策与管理员明文查看"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            <RefreshCw className="size-basalt-icon-lg" strokeWidth={1.5} />
            刷新
          </Button>
        }
        filters={
          <FilterBar
            label="筛选审计日志"
            active={hasActiveFilters}
            onClear={handleClearFilters}
            clearLabel="清除筛选"
            chips={
              hasActiveFilters ? (
                <>
                  {clientFilter !== "all" && (
                    <FilterChip
                      label="消费方"
                      value={clientDisplayLabel}
                      onRemove={() => handleClientChange("all")}
                    />
                  )}
                  {toolFilter !== "all" && (
                    <FilterChip
                      label="工具"
                      value={toolFilter}
                      onRemove={() => handleToolChange("all")}
                    />
                  )}
                  {decisionFilter !== "all" && (
                    <FilterChip
                      label="决策"
                      value={decisionLabel}
                      onRemove={() => handleDecisionChange("all")}
                    />
                  )}
                </>
              ) : undefined
            }
          >
            <Select value={clientFilter} onValueChange={handleClientChange}>
              <SelectTrigger className="w-48" aria-label="按消费方筛选">
                <SelectValue placeholder="全部消费方" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部消费方</SelectItem>
                <SelectItem value="admin">管理员后台</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.clientId} value={c.clientId}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={toolFilter} onValueChange={handleToolChange}>
              <SelectTrigger className="w-40" aria-label="按工具筛选">
                <SelectValue placeholder="全部操作" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部操作</SelectItem>
                <SelectItem value="get_secret">get_secret</SelectItem>
                <SelectItem value="list_secrets">list_secrets</SelectItem>
                <SelectItem value="search_secrets">search_secrets</SelectItem>
                <SelectItem value="whoami">whoami</SelectItem>
                <SelectItem value="admin_reveal">admin_reveal</SelectItem>
              </SelectContent>
            </Select>

            <Select value={decisionFilter} onValueChange={handleDecisionChange}>
              <SelectTrigger className="w-36" aria-label="按决策筛选">
                <SelectValue placeholder="全部结果" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部结果</SelectItem>
                <SelectItem value="allowed">放行</SelectItem>
                <SelectItem value="denied">拒绝</SelectItem>
                <SelectItem value="expired">已过期</SelectItem>
                <SelectItem value="disabled">已停用</SelectItem>
                <SelectItem value="not_found">未找到</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        }
      />

      <Banner
        tone="info"
        size="sm"
        icon={<Info className="size-basalt-icon-lg" strokeWidth={1.5} />}
        title="90 天自动清理策略"
        description="系统每日凌晨 03:00 (UTC) 通过 Cloudflare Cron Trigger 自动清除超过 90 天的历史审计日志。"
      />

      {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

      <LayerCard padding="none">
        <LayerCard.Body className="p-0">
          {loading && logs.length === 0 ? (
            <div role="status" aria-label="加载审计日志...">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>消费方</TableHead>
                    <TableHead>工具 / 操作</TableHead>
                    <TableHead>目标密钥</TableHead>
                    <TableHead>取用原因</TableHead>
                    <TableHead>决策</TableHead>
                    <TableHead className="text-right">耗时</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 8 }, (_, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Skeleton width={96} height={14} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={110} height={14} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={88} height={14} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={104} height={14} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={160} height={14} />
                      </TableCell>
                      <TableCell>
                        <Skeleton width={48} height={20} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton width={40} height={14} className="ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : logs.length === 0 ? (
            <LayerCard.Empty
              title="暂无审计日志"
              description="还没有匹配当前筛选条件的调用记录"
              className="p-basalt-card-lg"
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>消费方</TableHead>
                    <TableHead>工具 / 操作</TableHead>
                    <TableHead>目标密钥</TableHead>
                    <TableHead>取用原因</TableHead>
                    <TableHead>决策</TableHead>
                    <TableHead className="text-right">耗时</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((row) => {
                    const decision = getAuditDecisionMeta(row.decision);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap font-mono text-basalt-sm text-basalt-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">{row.clientName}</TableCell>
                        <TableCell className="font-mono text-basalt-sm">{row.toolName}</TableCell>
                        <TableCell className="font-mono text-basalt-sm">
                          {row.secretSlug ?? row.secretId ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-basalt-md">
                          {row.reason ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge tone={decision.tone} variant="soft">
                            {decision.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-basalt-sm tabular-nums text-basalt-muted-foreground">
                          {row.latencyMs !== null ? `${row.latencyMs}ms` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="border-t border-basalt-border p-basalt-card-sm">
                <TablePager
                  page={page}
                  pageSize={pageSize}
                  totalCount={total}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </LayerCard.Body>
      </LayerCard>
    </div>
  );
}

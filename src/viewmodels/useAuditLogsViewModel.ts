import { useCallback, useEffect, useState } from "react";
import { api } from "@/data/api";
import type { AuditLogItem, ClientPolicyItem } from "@/models/types";

const PAGE_SIZE = 25;

export interface AuditLogInitialFilters {
  client?: string;
  tool?: string;
  decision?: string;
}

export function useAuditLogsViewModel(initialFilters?: AuditLogInitialFilters) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<ClientPolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientFilter, setClientFilter] = useState(initialFilters?.client || "all");
  const [decisionFilter, setDecisionFilter] = useState(initialFilters?.decision || "all");
  const [toolFilter, setToolFilter] = useState(initialFilters?.tool || "all");
  const [page, setPage] = useState(1);

  const loadClients = useCallback(async () => {
    try {
      const res = await api.listClients();
      setClients(res.items);
    } catch {
      // Filter options are best-effort; main log query surfaces errors.
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listLogs({
        clientId: clientFilter !== "all" ? clientFilter : undefined,
        decision: decisionFilter !== "all" ? decisionFilter : undefined,
        toolName: toolFilter !== "all" ? toolFilter : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setLogs(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载审计日志失败");
    } finally {
      setLoading(false);
    }
  }, [clientFilter, decisionFilter, toolFilter, page]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters =
    clientFilter !== "all" || decisionFilter !== "all" || toolFilter !== "all";

  const updateClientFilter = useCallback((value: string) => {
    setClientFilter(value);
    setPage(1);
  }, []);

  const updateDecisionFilter = useCallback((value: string) => {
    setDecisionFilter(value);
    setPage(1);
  }, []);

  const updateToolFilter = useCallback((value: string) => {
    setToolFilter(value);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setClientFilter("all");
    setDecisionFilter("all");
    setToolFilter("all");
    setPage(1);
  }, []);

  return {
    logs,
    total,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    setPage,
    clients,
    clientFilter,
    setClientFilter: updateClientFilter,
    decisionFilter,
    setDecisionFilter: updateDecisionFilter,
    toolFilter,
    setToolFilter: updateToolFilter,
    hasActiveFilters,
    clearFilters,
    loading,
    error,
    reload: loadLogs,
  };
}

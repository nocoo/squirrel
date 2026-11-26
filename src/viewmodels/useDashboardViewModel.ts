import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/data/api";
import {
  buildDailyChartData,
  computeAllowRate,
  computeAllowRateValue,
  computePeriodDelta,
} from "@/models/dashboard";
import type { DashboardStats } from "@/models/types";

export function useDashboardViewModel() {
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getStats(targetDays);
      setStats(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const chartData = useMemo(() => buildDailyChartData(stats), [stats]);
  const allowRate = useMemo(
    () => (stats ? computeAllowRate(stats.summary.allowedCalls, stats.summary.totalCalls) : "—"),
    [stats],
  );
  const allowRateValue = useMemo(
    () =>
      stats ? computeAllowRateValue(stats.summary.allowedCalls, stats.summary.totalCalls) : null,
    [stats],
  );
  const callsDelta = useMemo(
    () =>
      stats ? computePeriodDelta(stats.summary.totalCalls, stats.summary.previousTotalCalls) : null,
    [stats],
  );
  const deniedDelta = useMemo(
    () =>
      stats
        ? computePeriodDelta(stats.summary.deniedCalls, stats.summary.previousDeniedCalls)
        : null,
    [stats],
  );

  return {
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
    reload: () => load(days),
  };
}

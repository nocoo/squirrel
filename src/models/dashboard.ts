import { formatShortDate } from "./format";
import type { DashboardStats } from "./types";

export interface DailyChartPoint {
  date: string;
  label: string;
  allowed: number;
  denied: number;
}

export function buildDailyChartData(stats: DashboardStats | null): DailyChartPoint[] {
  if (!stats) return [];
  return stats.dailySeries.map((point) => ({
    date: point.date,
    label: formatShortDate(point.date),
    allowed: point.allowed,
    denied: point.denied,
  }));
}

export function computeAllowRate(allowed: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((allowed / total) * 100)}%`;
}

export function computeAllowRateValue(allowed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((allowed / total) * 100);
}

export function computePeriodDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

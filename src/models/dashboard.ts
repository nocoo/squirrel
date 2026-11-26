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

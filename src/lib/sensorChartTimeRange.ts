/**
 * Pure helpers for SensorChart time-range filtering + tooltip timestamp
 * formatting. Keeping these out of JSX guarantees the same rules are
 * testable headlessly and prevents inline time logic from drifting.
 *
 * No I/O, no React, no Recharts. Deterministic.
 */
import { format } from "date-fns";
import { sortTimeSeriesAscending } from "@/lib/sortTimeSeriesAscending";

export type SensorChartTimeRange = "7d" | "30d" | "90d" | "all";

export const SENSOR_CHART_TIME_RANGES: ReadonlyArray<{
  value: SensorChartTimeRange;
  label: string;
}> = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

const RANGE_DAYS: Record<Exclude<SensorChartTimeRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Filter time-series points by range relative to `now`, then return them
 * in ascending chronological order. Invalid/missing timestamps are
 * dropped from bounded ranges and pushed to the end of "all" rather than
 * scrambling chronological order.
 */
export function filterTimeSeriesByRange<T>(
  points: ReadonlyArray<T> | null | undefined,
  range: SensorChartTimeRange,
  getTimestamp: (point: T) => string | number | Date | null | undefined,
  now: number = Date.now(),
): T[] {
  if (!points || points.length === 0) return [];
  const sorted = sortTimeSeriesAscending(points, getTimestamp);
  if (range === "all") return sorted;
  const windowMs = RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;
  return sorted.filter((p) => {
    const raw = getTimestamp(p);
    if (raw == null) return false;
    const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
    if (!Number.isFinite(t)) return false;
    return t >= cutoff;
  });
}

/**
 * Format a timestamp for chart tooltips. Stable, locale-aware human
 * shape (e.g. "May 31, 2026, 1:44 PM"). Returns "Unknown time" for
 * invalid input so tooltips never render NaN or raw ISO strings.
 */
export function formatChartTooltipTimestamp(
  ts: string | number | Date | null | undefined,
): string {
  if (ts === null || ts === undefined || ts === "") return "Unknown time";
  const d = ts instanceof Date ? ts : new Date(ts);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "Unknown time";
  try {
    return format(d, "PPpp");
  } catch {
    return "Unknown time";
  }
}

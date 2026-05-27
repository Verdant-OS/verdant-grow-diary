/**
 * Pure helpers for chronology-aware manual sensor deltas.
 *
 * Given a plant's manual log history and a "current" log (captured_at +
 * per-metric values), returns the per-metric delta plus a human-readable
 * time context. No I/O, no React.
 *
 * Deltas are derived from captured_at chronology. Manual logs use source='manual'.
 * Per-metric comparison is against the most recent strictly-prior log that
 * has a finite value for the same metric. Back-dated rows are handled by
 * re-sorting on every read; deltas are never persisted as truth.
 *
 * Safety contract is asserted by src/test/manual-sensor-chronology-delta.test.ts.
 */
import type { ManualSensorMetric } from "./manualSensorFreshnessRules";
import { METRIC_UNITS } from "./manualSensorFreshnessRules";

export const MANUAL_SOURCE = "manual" as const;

export type ChronologyDirection = "up" | "down" | "stable" | "first_log";

export interface ManualSensorLog {
  /** Optional stable id used only as a deterministic tie-breaker. */
  id?: string;
  /** ISO timestamp of when the reading was captured (not insertion time). */
  capturedAt: string;
  /** Source tag from details.manual_sensor_snapshot.source. */
  source?: string | null;
  /** Per-metric values. Missing/undefined/null = "not reported in this log". */
  metrics: Partial<Record<ManualSensorMetric, number | null | undefined>>;
}

export interface ChronologyDelta {
  metric: ManualSensorMetric;
  currentValue: number;
  previousValue: number | null;
  delta: number | null;
  direction: ChronologyDirection;
  first_log: boolean;
  stable: boolean;
  priorCapturedAt: string | null;
  timeContext: string | null;
  label: string;
}

const FLAT_EPSILON: Record<ManualSensorMetric, number> = {
  temp_f: 0.5,
  humidity_percent: 0.5,
  ph: 0.05,
  ec: 0.005,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function formatMagnitude(metric: ManualSensorMetric, n: number): string {
  switch (metric) {
    case "temp_f":
    case "humidity_percent":
      return String(Math.round(n));
    case "ph":
      return n.toFixed(1);
    case "ec":
      return n.toFixed(2);
  }
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Deterministic, locale-free "MMM D" formatter. UTC-based for stable tests. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Build human time context describing the gap between currentCapturedAt and
 * priorCapturedAt. Returns null when either timestamp is invalid.
 *
 *   <24h  -> "X hours ago" (or "1 hour ago", "just now" for <1h)
 *   1-6d  -> "over X days"
 *   >=7d  -> "since MMM D"
 */
export function formatTimeContext(
  currentCapturedAt: string,
  priorCapturedAt: string,
): string | null {
  const cur = parseMs(currentCapturedAt);
  const prev = parseMs(priorCapturedAt);
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  if (diff <= 0) {
    // Defensive: prior should be strictly older. Fall back to short date.
    return `since ${shortDate(priorCapturedAt)}`;
  }
  if (diff < HOUR_MS) return "just now";
  if (diff < DAY_MS) {
    const hours = Math.max(1, Math.round(diff / HOUR_MS));
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (diff < 7 * DAY_MS) {
    const days = Math.max(1, Math.round(diff / DAY_MS));
    return `over ${days} ${days === 1 ? "day" : "days"}`;
  }
  return `since ${shortDate(priorCapturedAt)}`;
}

interface SortableLog extends ManualSensorLog {
  _ms: number;
  _idx: number;
}

/**
 * Filter to manual-source logs with parseable capturedAt, then sort newest-first.
 * Stable tie-breakers for equal capturedAt:
 *   1. id ASC (lexicographic) when both have ids
 *   2. original insertion index ASC otherwise
 */
function sortedManualLogs(history: ReadonlyArray<ManualSensorLog>): SortableLog[] {
  const enriched: SortableLog[] = [];
  history.forEach((log, idx) => {
    if (log.source !== MANUAL_SOURCE) return;
    const ms = parseMs(log.capturedAt);
    if (ms === null) return;
    enriched.push({ ...log, _ms: ms, _idx: idx });
  });
  enriched.sort((a, b) => {
    if (b._ms !== a._ms) return b._ms - a._ms;
    if (a.id && b.id && a.id !== b.id) return a.id < b.id ? -1 : 1;
    return a._idx - b._idx;
  });
  return enriched;
}

/**
 * Find the most recent strictly-prior manual log with a finite value for `metric`.
 * Strictly prior means capturedAt < currentCapturedAt; equal timestamps are
 * excluded so back-dating to the same instant never compares to itself.
 */
function findPriorReading(
  metric: ManualSensorMetric,
  currentCapturedAt: string,
  history: ReadonlyArray<ManualSensorLog>,
): { value: number; capturedAt: string } | null {
  const curMs = parseMs(currentCapturedAt);
  if (curMs === null) return null;
  const sorted = sortedManualLogs(history);
  for (const log of sorted) {
    if (log._ms >= curMs) continue;
    const v = log.metrics[metric];
    if (isFiniteNumber(v)) {
      return { value: v, capturedAt: log.capturedAt };
    }
  }
  return null;
}

/**
 * Compute a chronology-aware delta for a single metric.
 * Returns null when current value is not finite (nothing to render).
 */
export function computeChronologyDelta(
  metric: ManualSensorMetric,
  currentValue: number | null | undefined,
  currentCapturedAt: string,
  history: ReadonlyArray<ManualSensorLog>,
): ChronologyDelta | null {
  if (!isFiniteNumber(currentValue)) return null;

  const prior = findPriorReading(metric, currentCapturedAt, history);
  if (!prior) {
    return {
      metric,
      currentValue,
      previousValue: null,
      delta: null,
      direction: "first_log",
      first_log: true,
      stable: false,
      priorCapturedAt: null,
      timeContext: null,
      label: "first log",
    };
  }

  const diff = currentValue - prior.value;
  const eps = FLAT_EPSILON[metric];
  const timeContext = formatTimeContext(currentCapturedAt, prior.capturedAt);

  if (Math.abs(diff) < eps) {
    return {
      metric,
      currentValue,
      previousValue: prior.value,
      delta: 0,
      direction: "stable",
      first_log: false,
      stable: true,
      priorCapturedAt: prior.capturedAt,
      timeContext,
      label: "no change since last log",
    };
  }

  const direction: ChronologyDirection = diff > 0 ? "up" : "down";
  const sign = diff > 0 ? "+" : "-";
  const magnitude = formatMagnitude(metric, Math.abs(diff));
  const unit = METRIC_UNITS[metric];
  const suffix = timeContext ?? "since last log";
  return {
    metric,
    currentValue,
    previousValue: prior.value,
    delta: diff,
    direction,
    first_log: false,
    stable: false,
    priorCapturedAt: prior.capturedAt,
    timeContext,
    label: `${sign}${magnitude}${unit} ${suffix}`,
  };
}

/**
 * Convenience: compute deltas for every metric present in `currentMetrics`.
 * Skips metrics whose current value is null/undefined/NaN (never invents 0).
 */
export function buildChronologyDeltas(args: {
  currentCapturedAt: string;
  currentMetrics: Partial<Record<ManualSensorMetric, number | null | undefined>>;
  history: ReadonlyArray<ManualSensorLog>;
}): Partial<Record<ManualSensorMetric, ChronologyDelta>> {
  const out: Partial<Record<ManualSensorMetric, ChronologyDelta>> = {};
  for (const metric of Object.keys(args.currentMetrics) as ManualSensorMetric[]) {
    const v = args.currentMetrics[metric];
    const d = computeChronologyDelta(metric, v, args.currentCapturedAt, args.history);
    if (d) out[metric] = d;
  }
  return out;
}

/**
 * Pure bucketing/aggregation helpers for the operator edge-metrics trend page.
 *
 * The page reads rows directly from public.edge_function_metric_events (operator
 * SELECT policy) and calls these helpers to produce chart-ready series. Kept
 * side-effect free so it can be unit-tested without a DB.
 */

export type EdgeMetricEventRow = {
  event_type: string;
  outcome: string | null;
  duration_ms: number | null;
  requests_in_window: number | null;
  duration_ms_mean_in_window: number | null;
  duration_ms_max_in_window: number | null;
  counters: Record<string, unknown> | null;
  supabase_env: string | null;
  fn: string;
  created_at: string;
};

export type TrendBucket = "hour" | "day";

export type TrendRange = {
  label: string;
  windowMs: number;
  bucket: TrendBucket;
};

export const TREND_RANGES: Record<"24h" | "7d" | "30d", TrendRange> = {
  "24h": { label: "Last 24 hours", windowMs: 24 * 60 * 60 * 1000, bucket: "hour" },
  "7d": { label: "Last 7 days", windowMs: 7 * 24 * 60 * 60 * 1000, bucket: "day" },
  "30d": { label: "Last 30 days", windowMs: 30 * 24 * 60 * 60 * 1000, bucket: "day" },
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function bucketStart(tsMs: number, bucket: TrendBucket): number {
  const size = bucket === "hour" ? HOUR_MS : DAY_MS;
  return Math.floor(tsMs / size) * size;
}

/** Filter rows to a specific event type, non-null timestamp, inside range. */
function filterRows(
  rows: readonly EdgeMetricEventRow[],
  eventType: string,
  nowMs: number,
  windowMs: number,
): { row: EdgeMetricEventRow; ts: number }[] {
  const cutoff = nowMs - windowMs;
  const out: { row: EdgeMetricEventRow; ts: number }[] = [];
  for (const row of rows) {
    if (row.event_type !== eventType) continue;
    const ts = Date.parse(row.created_at);
    if (!Number.isFinite(ts) || ts < cutoff || ts > nowMs) continue;
    out.push({ row, ts });
  }
  return out;
}

export type RequestMetricBucket = {
  bucketStartMs: number;
  total: number;
  byOutcome: Record<string, number>;
  latencyMeanMs: number | null;
  latencyMaxMs: number | null;
};

/**
 * Bucket per-request rows (event_type = 'request_metric') into equal-width
 * time buckets. Outcome counts are summed; latency is averaged per bucket
 * (mean of durations) and max is the max observed.
 */
export function bucketRequestMetrics(
  rows: readonly EdgeMetricEventRow[],
  range: TrendRange,
  nowMs: number,
): RequestMetricBucket[] {
  const filtered = filterRows(rows, "request_metric", nowMs, range.windowMs);
  const map = new Map<number, RequestMetricBucket & { _sum: number; _n: number }>();
  for (const { row, ts } of filtered) {
    const key = bucketStart(ts, range.bucket);
    let b = map.get(key);
    if (!b) {
      b = {
        bucketStartMs: key,
        total: 0,
        byOutcome: {},
        latencyMeanMs: null,
        latencyMaxMs: null,
        _sum: 0,
        _n: 0,
      };
      map.set(key, b);
    }
    b.total += 1;
    const outcome = row.outcome ?? "unknown";
    b.byOutcome[outcome] = (b.byOutcome[outcome] ?? 0) + 1;
    if (typeof row.duration_ms === "number" && Number.isFinite(row.duration_ms)) {
      b._sum += row.duration_ms;
      b._n += 1;
      if (b.latencyMaxMs === null || row.duration_ms > b.latencyMaxMs) {
        b.latencyMaxMs = row.duration_ms;
      }
    }
  }
  const buckets = [...map.values()].sort((a, b) => a.bucketStartMs - b.bucketStartMs);
  return buckets.map((b) => ({
    bucketStartMs: b.bucketStartMs,
    total: b.total,
    byOutcome: b.byOutcome,
    latencyMeanMs: b._n > 0 ? Number((b._sum / b._n).toFixed(2)) : null,
    latencyMaxMs: b.latencyMaxMs,
  }));
}

export type SnapshotBucket = {
  bucketStartMs: number;
  requestsInWindow: number;
  latencyMeanMs: number | null;
  latencyMaxMs: number | null;
  counters: Record<string, number>;
};

/**
 * Bucket metric_snapshot rows. Multiple snapshots inside the same bucket are
 * merged: counters summed, requestsInWindow summed, latency mean weighted by
 * requestsInWindow, max = max.
 */
export function bucketSnapshots(
  rows: readonly EdgeMetricEventRow[],
  range: TrendRange,
  nowMs: number,
): SnapshotBucket[] {
  const filtered = filterRows(rows, "metric_snapshot", nowMs, range.windowMs);
  const map = new Map<
    number,
    SnapshotBucket & { _weightedLatencySum: number; _weightedLatencyN: number }
  >();
  for (const { row, ts } of filtered) {
    const key = bucketStart(ts, range.bucket);
    let b = map.get(key);
    if (!b) {
      b = {
        bucketStartMs: key,
        requestsInWindow: 0,
        latencyMeanMs: null,
        latencyMaxMs: null,
        counters: {},
        _weightedLatencySum: 0,
        _weightedLatencyN: 0,
      };
      map.set(key, b);
    }
    const n = row.requests_in_window ?? 0;
    b.requestsInWindow += n;
    if (
      typeof row.duration_ms_mean_in_window === "number" &&
      Number.isFinite(row.duration_ms_mean_in_window) &&
      n > 0
    ) {
      b._weightedLatencySum += row.duration_ms_mean_in_window * n;
      b._weightedLatencyN += n;
    }
    if (
      typeof row.duration_ms_max_in_window === "number" &&
      Number.isFinite(row.duration_ms_max_in_window)
    ) {
      if (b.latencyMaxMs === null || row.duration_ms_max_in_window > b.latencyMaxMs) {
        b.latencyMaxMs = row.duration_ms_max_in_window;
      }
    }
    if (row.counters && typeof row.counters === "object") {
      for (const [k, v] of Object.entries(row.counters)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          b.counters[k] = (b.counters[k] ?? 0) + v;
        }
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => a.bucketStartMs - b.bucketStartMs)
    .map((b) => ({
      bucketStartMs: b.bucketStartMs,
      requestsInWindow: b.requestsInWindow,
      latencyMeanMs:
        b._weightedLatencyN > 0
          ? Number((b._weightedLatencySum / b._weightedLatencyN).toFixed(2))
          : null,
      latencyMaxMs: b.latencyMaxMs,
      counters: b.counters,
    }));
}

/** Distinct sorted values seen in a column, with `null` mapped to "(none)". */
export function distinctValues(
  rows: readonly EdgeMetricEventRow[],
  key: "fn" | "supabase_env" | "outcome",
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row[key];
    set.add(v ?? "(none)");
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** All distinct outcomes across a set of bucketed request-metric rows. */
export function distinctOutcomes(buckets: readonly RequestMetricBucket[]): string[] {
  const set = new Set<string>();
  for (const b of buckets) for (const k of Object.keys(b.byOutcome)) set.add(k);
  return [...set].sort();
}

/**
 * Pure helpers for the Sensor Source Health presenter.
 *
 * Read-only: groups existing sensor_readings rows by `source` label and
 * derives a presenter status (active / stale / no_recent_data). Does not
 * write to the database, never triggers alerts, never affects the Action
 * Queue, and never speaks for plant or environment health.
 */

export const SENSOR_SOURCE_STALE_MINUTES = 30;
export const SENSOR_SOURCE_NO_DATA_HOURS = 24;

export type SensorSourceStatus = "active" | "stale" | "no_recent_data";

export type SensorSourceHealthInput = {
  source?: string | null;
  metric?: string | null;
  /** Device-reported timestamp, may be null. */
  captured_at?: string | null;
  /** Server-stamped fallback. */
  ts?: string | null;
};

export type SensorSourceHealth = {
  source: string;
  status: SensorSourceStatus;
  /** ISO timestamp of the most recent reading, or null if none is valid. */
  lastReceivedAt: string | null;
  /** Age in minutes vs. `now`, or null if no valid timestamp. */
  ageMinutes: number | null;
  /** Total readings observed for this source in the input window. */
  readingCount: number;
  /** Distinct metric labels seen, sorted lexically. */
  metrics: string[];
};

/** Parse an ISO-ish timestamp safely. Returns null for null/empty/NaN. */
function parseTimestamp(input: string | null | undefined): number | null {
  if (!input || typeof input !== "string") return null;
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : null;
}

/** Pick the newest valid timestamp from (captured_at, ts), preferring captured_at. */
function newestTimestamp(row: SensorSourceHealthInput): number | null {
  const c = parseTimestamp(row.captured_at);
  const s = parseTimestamp(row.ts);
  if (c == null) return s;
  if (s == null) return c;
  return Math.max(c, s);
}

function deriveStatus(ageMinutes: number | null): SensorSourceStatus {
  if (ageMinutes == null) return "no_recent_data";
  if (ageMinutes <= SENSOR_SOURCE_STALE_MINUTES) return "active";
  if (ageMinutes <= SENSOR_SOURCE_NO_DATA_HOURS * 60) return "stale";
  return "no_recent_data";
}

const STATUS_ORDER: Record<SensorSourceStatus, number> = {
  active: 0,
  stale: 1,
  no_recent_data: 2,
};

/**
 * Group readings by source label and derive presenter status. Deterministic:
 * - active first, then stale, then no_recent_data
 * - within a status bucket, newest-first by last received timestamp
 * - source label as final lexical tie-breaker
 */
export function buildSensorSourceHealth(
  rows: readonly SensorSourceHealthInput[] | null | undefined,
  now: Date = new Date(),
): SensorSourceHealth[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const nowMs = now.getTime();
  const groups = new Map<string, {
    source: string;
    latest: number | null;
    count: number;
    metrics: Set<string>;
  }>();

  for (const row of rows) {
    const source = (row?.source ?? "").trim() || "unknown";
    const ts = newestTimestamp(row);
    const metric = (row?.metric ?? "").trim();

    const g = groups.get(source) ?? {
      source,
      latest: null,
      count: 0,
      metrics: new Set<string>(),
    };
    g.count += 1;
    if (metric) g.metrics.add(metric);
    if (ts != null && (g.latest == null || ts > g.latest)) g.latest = ts;
    groups.set(source, g);
  }

  const items: SensorSourceHealth[] = [];
  for (const g of groups.values()) {
    const ageMinutes = g.latest == null
      ? null
      : Math.max(0, Math.round((nowMs - g.latest) / 60_000));
    items.push({
      source: g.source,
      status: deriveStatus(ageMinutes),
      lastReceivedAt: g.latest == null ? null : new Date(g.latest).toISOString(),
      ageMinutes,
      readingCount: g.count,
      metrics: Array.from(g.metrics).sort(),
    });
  }

  items.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const at = a.lastReceivedAt ? Date.parse(a.lastReceivedAt) : -Infinity;
    const bt = b.lastReceivedAt ? Date.parse(b.lastReceivedAt) : -Infinity;
    if (at !== bt) return bt - at;
    return a.source.localeCompare(b.source);
  });

  return items;
}

/** Compact, grower-friendly relative-age label. Pure & deterministic. */
export function formatSourceAge(ageMinutes: number | null): string {
  if (ageMinutes == null) return "no data";
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

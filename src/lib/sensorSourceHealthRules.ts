/**
 * Pure helpers for the Sensor Source Health presenter.
 *
 * Read-only: groups existing sensor_readings rows by `source` label and
 * derives a presenter status (active / stale / no_recent_data). Does not
 * write to the database, never triggers alerts, never affects the Action
 * Queue, and never speaks for plant or environment health.
 */

import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";

export const SENSOR_SOURCE_STALE_MINUTES = 30;
export const SENSOR_SOURCE_NO_DATA_HOURS = 24;

export type SensorSourceStatus = "active" | "stale" | "diagnostic" | "no_recent_data";

export type SensorSourceHealthInput = {
  source?: string | null;
  metric?: string | null;
  /** Device-reported timestamp, may be null. */
  captured_at?: string | null;
  /** Server-stamped fallback. */
  ts?: string | null;
  /** Opaque provenance envelope used only by the shared diagnostic fence. */
  raw_payload?: unknown;
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

/**
 * Resolve the actual observation timestamp. A present `captured_at` is the
 * grower's measurement time; `ts` is only the fallback for legacy rows that
 * never stored one. Never use a later import timestamp to freshen CSV data.
 */
function newestTimestamp(row: SensorSourceHealthInput): number | null {
  return parseTimestamp(resolveSensorObservationTime(row));
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
  diagnostic: 2,
  no_recent_data: 3,
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
  const groups = new Map<
    string,
    {
      source: string;
      latest: number | null;
      count: number;
      metrics: Set<string>;
      diagnosticLatest: number | null;
      diagnosticCount: number;
      diagnosticMetrics: Set<string>;
      forceStale: boolean;
      forceNoRecentData: boolean;
    }
  >();

  for (const row of rows) {
    const rawSource = (row?.source ?? "").trim();
    const source = rawSource || "unknown";
    const ts = newestTimestamp(row);
    const metric = (row?.metric ?? "").trim();
    const normalizedSource = normalizeSensorSource(rawSource);
    const diagnostic = isDiagnosticSensorProvenanceRow(row) || normalizedSource === "demo";

    const g = groups.get(source) ?? {
      source,
      latest: null,
      count: 0,
      metrics: new Set<string>(),
      diagnosticLatest: null,
      diagnosticCount: 0,
      diagnosticMetrics: new Set<string>(),
      forceStale: normalizedSource === "stale",
      forceNoRecentData:
        rawSource === "" ||
        rawSource.toLowerCase() === "invalid" ||
        rawSource.toLowerCase() === "unknown",
    };
    if (diagnostic) {
      g.diagnosticCount += 1;
      if (metric) g.diagnosticMetrics.add(metric);
      if (ts != null && (g.diagnosticLatest == null || ts > g.diagnosticLatest)) {
        g.diagnosticLatest = ts;
      }
    } else {
      // Diagnostic rows never advance the physical source freshness clock or
      // contribute metrics/counts to an active source group.
      g.count += 1;
      if (metric) g.metrics.add(metric);
      if (ts != null && (g.latest == null || ts > g.latest)) g.latest = ts;
    }
    groups.set(source, g);
  }

  const items: SensorSourceHealth[] = [];
  for (const g of groups.values()) {
    const diagnosticOnly = g.count === 0 && g.diagnosticCount > 0;
    const latest = diagnosticOnly ? g.diagnosticLatest : g.latest;
    const ageMinutes = latest == null ? null : Math.max(0, Math.round((nowMs - latest) / 60_000));
    const status: SensorSourceStatus = diagnosticOnly
      ? "diagnostic"
      : g.forceNoRecentData
        ? "no_recent_data"
        : g.forceStale
          ? ageMinutes != null && ageMinutes <= SENSOR_SOURCE_NO_DATA_HOURS * 60
            ? "stale"
            : "no_recent_data"
          : deriveStatus(ageMinutes);
    items.push({
      source: g.source,
      status,
      lastReceivedAt: latest == null ? null : new Date(latest).toISOString(),
      ageMinutes,
      readingCount: diagnosticOnly ? g.diagnosticCount : g.count,
      metrics: Array.from(diagnosticOnly ? g.diagnosticMetrics : g.metrics).sort(),
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

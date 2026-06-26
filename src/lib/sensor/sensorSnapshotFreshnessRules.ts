/**
 * sensorSnapshotFreshnessRules — pure freshness classifier for sensor snapshots.
 *
 * Hard rules:
 *  - demo never becomes live/fresh.
 *  - invalid never becomes healthy.
 *  - missing / malformed / far-future captured_at => invalid.
 *  - older than threshold => stale.
 *  - manual & csv carry through as their own source; freshness still
 *    informs the age label but they are not promoted to "live".
 */
import {
  normalizeSensorSource,
  type SensorSource,
} from "./sensorSourceRules";

export type SensorMetrics = Partial<{
  temp_f: number | null;
  temp_c: number | null;
  rh: number | null;
  vpd: number | null;
  soil_moisture: number | null;
  ec: number | null;
  ph: number | null;
}> & Record<string, number | null | undefined>;

export interface SensorSnapshot {
  source: SensorSource | string;
  captured_at: string | null | undefined;
  tent_id: string | null;
  plant_id?: string | null;
  confidence?: number | null;
  raw_payload?: unknown;
  metrics: SensorMetrics;
}

export type Freshness = "fresh" | "stale" | "invalid";

export interface FreshnessResult {
  source: SensorSource;
  freshness: Freshness;
  ageMs: number | null;
  ageLabel: string;
  /** True when callers should NOT treat the snapshot as healthy/live. */
  isDegraded: boolean;
}

export interface ClassifyOptions {
  /** Freshness window in ms. Default: 30 minutes. */
  freshnessMs?: number;
  /** Tolerated future drift (clock skew). Default: 2 minutes. */
  futureToleranceMs?: number;
  /** Injectable clock for tests. */
  now?: number;
}

const DEFAULT_FRESH_MS = 30 * 60 * 1000;
const DEFAULT_FUTURE_TOL = 2 * 60 * 1000;

function formatAge(ms: number): string {
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function classifySnapshotFreshness(
  snapshot: SensorSnapshot,
  options: ClassifyOptions = {},
): FreshnessResult {
  const source = normalizeSensorSource(snapshot.source);
  const freshnessMs = options.freshnessMs ?? DEFAULT_FRESH_MS;
  const futureTol = options.futureToleranceMs ?? DEFAULT_FUTURE_TOL;
  const now = options.now ?? Date.now();

  // Invalid source immediately collapses freshness to invalid.
  if (source === "invalid") {
    return {
      source,
      freshness: "invalid",
      ageMs: null,
      ageLabel: "unknown age",
      isDegraded: true,
    };
  }

  const captured = snapshot.captured_at;
  if (typeof captured !== "string" || captured.length === 0) {
    return {
      source,
      freshness: "invalid",
      ageMs: null,
      ageLabel: "no timestamp",
      isDegraded: true,
    };
  }
  const ts = Date.parse(captured);
  if (!Number.isFinite(ts)) {
    return {
      source,
      freshness: "invalid",
      ageMs: null,
      ageLabel: "bad timestamp",
      isDegraded: true,
    };
  }

  const ageMs = now - ts;
  if (ageMs < -futureTol) {
    return {
      source,
      freshness: "invalid",
      ageMs,
      ageLabel: "future timestamp",
      isDegraded: true,
    };
  }

  // demo & stale are explicit non-healthy sources; never promote.
  if (source === "demo") {
    return {
      source,
      freshness: "fresh", // demo can be "current" in the demo set, but is degraded
      ageMs: Math.max(ageMs, 0),
      ageLabel: formatAge(Math.max(ageMs, 0)),
      isDegraded: true,
    };
  }
  if (source === "stale") {
    return {
      source,
      freshness: "stale",
      ageMs: Math.max(ageMs, 0),
      ageLabel: formatAge(Math.max(ageMs, 0)),
      isDegraded: true,
    };
  }

  const effectiveAge = Math.max(ageMs, 0);
  const isStale = effectiveAge > freshnessMs;
  return {
    source,
    freshness: isStale ? "stale" : "fresh",
    ageMs: effectiveAge,
    ageLabel: formatAge(effectiveAge),
    isDegraded: isStale || source !== "live",
  };
}

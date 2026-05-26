/**
 * Pure helpers for the Plant Detail "Visual Data Decay" surface.
 *
 * Computes a freshness state for the latest manual sensor reading per metric.
 * Time is injectable for deterministic tests. Safety contract is enforced by
 * src/test/manual-sensor-freshness-and-delta.test.ts — keep this file a pure
 * read-only helper. Stale means "data is old", nothing more.
 */

export type ManualSensorMetric = "temp_f" | "humidity_percent" | "ph" | "ec";
export type FreshnessState = "fresh" | "aging" | "stale" | "missing";

export const MANUAL_SENSOR_METRICS: ReadonlyArray<ManualSensorMetric> = [
  "temp_f",
  "humidity_percent",
  "ph",
  "ec",
];

export const FRESHNESS_FRESH_MAX_HOURS = 24;
export const FRESHNESS_AGING_MAX_HOURS = 48;

export interface LatestManualReading {
  value: number;
  loggedAt: string; // ISO timestamp
}

export interface FreshnessSnapshot {
  metric: ManualSensorMetric;
  state: FreshnessState;
  value: number | null;
  loggedAt: string | null;
  ageHours: number | null;
}

export const METRIC_LABELS: Record<ManualSensorMetric, string> = {
  temp_f: "Temp",
  humidity_percent: "Humidity",
  ph: "pH",
  ec: "EC",
};

export const METRIC_UNITS: Record<ManualSensorMetric, string> = {
  temp_f: "°F",
  humidity_percent: "%",
  ph: "",
  ec: "",
};

function toMillis(iso: string | Date): number | null {
  const t = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Compute freshness state for a single metric.
 *  - null reading -> "missing"
 *  - <24h since logged -> "fresh"
 *  - 24-48h -> "aging"
 *  - >48h -> "stale"
 */
export function computeFreshness(
  reading: LatestManualReading | null,
  now: string | Date,
): FreshnessState {
  if (!reading) return "missing";
  const nowMs = toMillis(now);
  const loggedMs = toMillis(reading.loggedAt);
  if (nowMs === null || loggedMs === null) return "missing";
  const hours = (nowMs - loggedMs) / 3_600_000;
  if (hours < 0) return "fresh"; // future-dated guard -> treat as fresh, never stale
  if (hours < FRESHNESS_FRESH_MAX_HOURS) return "fresh";
  if (hours < FRESHNESS_AGING_MAX_HOURS) return "aging";
  return "stale";
}

export function buildFreshnessSnapshot(
  metric: ManualSensorMetric,
  reading: LatestManualReading | null,
  now: string | Date,
): FreshnessSnapshot {
  const state = computeFreshness(reading, now);
  if (!reading) {
    return { metric, state, value: null, loggedAt: null, ageHours: null };
  }
  const nowMs = toMillis(now);
  const loggedMs = toMillis(reading.loggedAt);
  const ageHours =
    nowMs !== null && loggedMs !== null ? (nowMs - loggedMs) / 3_600_000 : null;
  return {
    metric,
    state,
    value: reading.value,
    loggedAt: reading.loggedAt,
    ageHours,
  };
}

/**
 * Build the full 4-metric freshness snapshot from a latest-per-metric map.
 * Always returns all four metrics in stable order.
 */
export function buildFreshnessSnapshots(
  latest: Partial<Record<ManualSensorMetric, LatestManualReading | null>>,
  now: string | Date,
): FreshnessSnapshot[] {
  return MANUAL_SENSOR_METRICS.map((m) =>
    buildFreshnessSnapshot(m, latest[m] ?? null, now),
  );
}

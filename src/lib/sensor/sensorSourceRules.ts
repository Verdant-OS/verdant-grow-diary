/**
 * sensorSourceRules — canonical sensor source labels and normalization.
 *
 * Pure. No I/O. No React. Deterministic.
 *
 * Allowed sources only. Unknown / missing input must resolve to "invalid",
 * never to "live" or another healthy label.
 */

export const SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export type SensorSource = (typeof SENSOR_SOURCES)[number];

const ALIAS: Record<string, SensorSource> = {
  live: "live",
  sensor: "live",
  realtime: "live",
  manual: "manual",
  user: "manual",
  entry: "manual",
  log: "manual",
  csv: "csv",
  import: "csv",
  demo: "demo",
  mock: "demo",
  sample: "demo",
  fixture: "demo",
  stale: "stale",
  invalid: "invalid",
  unknown: "invalid",
};

const SOURCE_LABEL: Record<SensorSource, string> = {
  live: "Live sensor",
  manual: "Manual reading",
  csv: "CSV import",
  demo: "Demo data",
  stale: "Stale data",
  invalid: "Invalid reading",
};

/** Normalize any caller-supplied string into a canonical SensorSource. */
export function normalizeSensorSource(input: unknown): SensorSource {
  if (typeof input !== "string") return "invalid";
  const v = input.trim().toLowerCase();
  if (v.length === 0) return "invalid";
  return ALIAS[v] ?? "invalid";
}

export function isHealthySensorSource(source: SensorSource): boolean {
  // demo / stale / invalid are never healthy. manual and csv are
  // trusted-as-entered but not "live"; only live is healthy live data.
  return source === "live";
}

export function sensorSourceLabel(source: SensorSource): string {
  return SOURCE_LABEL[source];
}

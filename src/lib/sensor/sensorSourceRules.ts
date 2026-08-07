/**
 * sensorSourceRules — canonical sensor source labels and normalization.
 *
 * Pure. No I/O. No React. Deterministic.
 *
 * Allowed sources only. Unknown / missing input must resolve to "invalid",
 * never to "live" or another healthy label.
 *
 * Trust aliases for `live` are listed in sensorLiveMembership.TRUST_LIVE_ALIASES
 * (#592 / #584 residual). Transport-receiving and live-window membership
 * are separate tables — do not fold them into this normalizer.
 */

// Relative, not "@/lib/…": this module is inside the auto-generated MCP edge
// bundle's import closure, and the Vite "@/" alias does not exist in the Deno
// runtime. See docs/edge-shared-sync.md.
import { TRUST_LIVE_ALIASES } from "../sensorLiveMembership";

export const SENSOR_SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

export type SensorSource = (typeof SENSOR_SOURCES)[number];

const ALIAS: Record<string, SensorSource> = {
  live: "live",
  sensor: "live",
  realtime: "live",
  // First-party bridge is trust-live for badge purposes (matches
  // VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES reservation in sensorSnapshot).
  pi_bridge: "live",
  manual: "manual",
  user: "manual",
  entry: "manual",
  log: "manual",
  diary: "manual",
  manual_snapshot: "manual",
  csv: "csv",
  import: "csv",
  imported: "csv",
  demo: "demo",
  mock: "demo",
  sample: "demo",
  fixture: "demo",
  sim: "demo",
  stale: "stale",
  invalid: "invalid",
  unknown: "invalid",
};

// Keep TRUST_LIVE_ALIASES and ALIAS live entries aligned (dev-time pin).
for (const alias of TRUST_LIVE_ALIASES) {
  if (ALIAS[alias] === undefined) {
    ALIAS[alias] = "live";
  }
}

const SOURCE_LABEL: Record<SensorSource, string> = {
  live: "Live sensor",
  manual: "Manual reading",
  csv: "CSV import",
  demo: "Demo data",
  stale: "Stale data",
  invalid: "Invalid reading",
};

/**
 * Every RAW stored value that normalizes to one of the given canonical
 * sources. Lets server-side queries pre-filter on the same alias table
 * the client fence uses, so the two can never disagree about which raw
 * tokens are eligible.
 */
export function rawSensorSourceValuesFor(targets: ReadonlyArray<SensorSource>): string[] {
  return Object.entries(ALIAS)
    .filter(([, canonical]) => targets.includes(canonical))
    .map(([raw]) => raw)
    .sort();
}

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

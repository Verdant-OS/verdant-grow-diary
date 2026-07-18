/**
 * sensorSourceRules — canonical sensor source labels and normalization.
 *
 * Pure. No I/O. No React. Deterministic.
 *
 * Allowed sources only. Unknown / missing input must resolve to "invalid",
 * never to "live" or another healthy label.
 */

export const SENSOR_SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

export type SensorSource = (typeof SENSOR_SOURCES)[number];
import { assertCanonicalSensorSource } from "@/constants/sensorIngestProvenance";
import { evaluateCurrentLiveSensorTruth } from "@/lib/currentLiveSensorTruthRules";

const SOURCE_LABEL: Record<SensorSource, string> = {
  live: "Connected source (unverified)",
  manual: "Manual reading",
  csv: "CSV import",
  demo: "Demo data",
  stale: "Stale data",
  invalid: "Invalid reading",
};

/** Normalize any caller-supplied string into a canonical SensorSource. */
export function normalizeSensorSource(input: unknown): SensorSource {
  return assertCanonicalSensorSource(input) ?? "invalid";
}

export interface SensorSourceTruthProof {
  quality?: unknown;
  freshness?: unknown;
}

export function isHealthySensorSource(
  source: SensorSource,
  proof: SensorSourceTruthProof = {},
): boolean {
  return evaluateCurrentLiveSensorTruth({ source, ...proof }).isCurrentLive;
}

export function sensorSourceLabel(
  source: SensorSource,
  proof: SensorSourceTruthProof = {},
): string {
  if (isHealthySensorSource(source, proof)) return "Live sensor";
  return SOURCE_LABEL[source];
}

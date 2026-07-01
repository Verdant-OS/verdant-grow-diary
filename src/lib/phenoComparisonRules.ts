/**
 * phenoComparisonRules
 *
 * Pure helpers for the read-only Pheno Comparison preview surface.
 * No I/O. No React. No writes.
 *
 * Sensor sources allowed: live | manual | csv | demo | stale | invalid.
 * Anything else normalizes to "invalid" — never to a healthy label.
 */

export const PHENO_COMPARISON_SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export type PhenoComparisonSensorSource =
  (typeof PHENO_COMPARISON_SENSOR_SOURCES)[number];

export const PHENO_COMPARISON_TRUSTED_SOURCES: ReadonlySet<PhenoComparisonSensorSource> =
  new Set(["live", "manual", "csv"]);

export const PHENO_COMPARISON_UNTRUSTED_SOURCES: ReadonlySet<PhenoComparisonSensorSource> =
  new Set(["demo", "stale", "invalid"]);

const SOURCE_LABEL: Record<PhenoComparisonSensorSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

export function normalizePhenoSensorSource(
  input: unknown,
): PhenoComparisonSensorSource {
  if (typeof input !== "string") return "invalid";
  const v = input.trim().toLowerCase();
  if ((PHENO_COMPARISON_SENSOR_SOURCES as readonly string[]).includes(v)) {
    return v as PhenoComparisonSensorSource;
  }
  return "invalid";
}

export function phenoSensorSourceLabel(
  source: PhenoComparisonSensorSource,
): string {
  return SOURCE_LABEL[source];
}

export function isPhenoSensorSourceTrusted(
  source: PhenoComparisonSensorSource,
): boolean {
  return PHENO_COMPARISON_TRUSTED_SOURCES.has(source);
}

export interface PhenoMissingFlag {
  code:
    | "no_photo"
    | "no_sensor_snapshot"
    | "no_diary"
    | "missing_temp"
    | "missing_rh"
    | "missing_vpd"
    | "missing_ec"
    | "missing_ph"
    | "missing_ppfd"
    | "stale_reading"
    | "invalid_reading";
  message: string;
}

export const PHENO_MISSING_MESSAGES: Record<
  PhenoMissingFlag["code"],
  string
> = {
  no_photo: "No photo attached",
  no_sensor_snapshot: "No sensor snapshot",
  no_diary: "No Quick Log entries yet",
  missing_temp: "Missing temperature",
  missing_rh: "Missing humidity",
  missing_vpd: "Missing VPD",
  missing_ec: "Missing EC",
  missing_ph: "Missing pH",
  missing_ppfd: "Missing PPFD",
  stale_reading: "Reading is stale — not treated as current",
  invalid_reading: "Reading is invalid — not treated as healthy",
};

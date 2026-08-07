/**
 * phenoComparisonRules
 *
 * Pure helpers for the read-only Pheno Comparison preview surface.
 * No I/O. No React. No writes.
 *
 * Sensor sources allowed: live | manual | csv | demo | stale | invalid.
 *
 * Fail-closed strategy (Sensor Truth):
 *  - Unknown / non-string / free-text sources normalize to "invalid".
 *  - We never invent "live" or "manual" from loose labels (mqtt, device, …).
 *  - Only an explicit allowlisted source can later be treated as trusted.
 *  - "invalid" is untrusted and is never presented as a healthy reading.
 */

/**
 * Closed vocabulary for comparison sensor provenance.
 * Single source of truth for the PhenoComparisonSensorSource union and for
 * normalizePhenoSensorSource's allowlist — keep them in lockstep.
 */
export const PHENO_COMPARISON_SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

export type PhenoComparisonSensorSource = (typeof PHENO_COMPARISON_SENSOR_SOURCES)[number];

/**
 * Sources that may count as real evidence for comparison confidence.
 * Everything else (including normalized "invalid") stays untrusted.
 */
export const PHENO_COMPARISON_TRUSTED_SOURCES: ReadonlySet<PhenoComparisonSensorSource> = new Set([
  "live",
  "manual",
  "csv",
]);

/** Explicit untrusted partition — demo fixtures, aged reads, and fail-closed junk. */
export const PHENO_COMPARISON_UNTRUSTED_SOURCES: ReadonlySet<PhenoComparisonSensorSource> = new Set(
  ["demo", "stale", "invalid"],
);

const SOURCE_LABEL: Record<PhenoComparisonSensorSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

/**
 * Coerce hostile/loose provenance into the closed source union.
 *
 * Fail closed at every exit:
 *  1. Non-strings → "invalid" (do not call string ops on null/objects).
 *  2. Trim + lowercase only — no synonym map, no partial match.
 *  3. Exact allowlist hit → that label; otherwise → "invalid".
 *
 * Callers must already pass "stale" when age is known; this function does not
 * recompute freshness. Downstream trust is isPhenoSensorSourceTrusted only.
 */
export function normalizePhenoSensorSource(input: unknown): PhenoComparisonSensorSource {
  // Fail closed: non-strings are never promoted to a trusted source.
  if (typeof input !== "string") return "invalid";
  const v = input.trim().toLowerCase();
  // Fail closed: exact allowlist only — unknown tokens become "invalid", not "live".
  if ((PHENO_COMPARISON_SENSOR_SOURCES as readonly string[]).includes(v)) {
    return v as PhenoComparisonSensorSource;
  }
  return "invalid";
}

export function phenoSensorSourceLabel(source: PhenoComparisonSensorSource): string {
  return SOURCE_LABEL[source];
}

/**
 * Trust is set membership only (fail closed): live | manual | csv.
 * Requires a value already produced by normalizePhenoSensorSource — never
 * pass raw payload strings here without normalizing first.
 */
export function isPhenoSensorSourceTrusted(source: PhenoComparisonSensorSource): boolean {
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

export const PHENO_MISSING_MESSAGES: Record<PhenoMissingFlag["code"], string> = {
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

/** Short legend describing each allowed source, for read-only presenter use. */
export const PHENO_SOURCE_LEGEND: ReadonlyArray<{
  source: PhenoComparisonSensorSource;
  label: string;
  description: string;
  trusted: boolean;
}> = [
  { source: "live", label: "Live", description: "Live device reading.", trusted: true },
  { source: "manual", label: "Manual", description: "Grower-entered snapshot.", trusted: true },
  { source: "csv", label: "CSV", description: "Imported history from CSV.", trusted: true },
  {
    source: "demo",
    label: "Demo",
    description: "Sample data — not real telemetry.",
    trusted: false,
  },
  {
    source: "stale",
    label: "Stale",
    description: "Old reading — not treated as current.",
    trusted: false,
  },
  {
    source: "invalid",
    label: "Invalid",
    description: "Bad or unknown reading — never treated as healthy.",
    trusted: false,
  },
];

/** Read-only confidence caveat shown on the preview surface. */
export const PHENO_COMPARISON_CONFIDENCE_CAVEAT =
  "Comparison confidence depends on available evidence. Missing photos, missing metrics, stale or invalid readings weaken the comparison and are never treated as healthy.";

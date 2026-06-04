/**
 * vpdDriftRules — pure TypeScript mirror of the SQL helper
 * `public.evaluate_vpd_drift_ewma`.
 *
 * Lets the AI Doctor context layer compute and reason about VPD drift
 * without an extra round-trip when the readings + effective band are
 * already in hand.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control, no Action Queue writes.
 *   - Returns advisory context only. Caller decides whether to surface a
 *     review suggestion; this helper NEVER creates an Action Queue item.
 *   - Stage-aware bands must come from the caller (loaded under RLS).
 *     This helper does NOT fetch bands itself — it cannot leak custom
 *     user bands to untrusted ingest/bridge contexts.
 */

export type VpdDriftClassification =
  | "insufficient"
  | "in_band"
  | "sustained_high"
  | "sustained_low";

export interface VpdDriftReading {
  /** ISO timestamp. Used only for ordering. */
  capturedAt: string;
  /** kPa. Non-finite values are filtered out. */
  value: number | null | undefined;
}

export interface VpdDriftBand {
  lowKpa: number;
  highKpa: number;
}

export interface EvaluateVpdDriftEwmaInput {
  readings: VpdDriftReading[];
  band: VpdDriftBand | null | undefined;
  /** EWMA smoothing factor. Defaults to 0.3. Coerced into (0, 1]. */
  alpha?: number;
  /** Minimum sample count to issue a non-insufficient classification. */
  minReadings?: number;
}

export interface VpdDriftResult {
  classification: VpdDriftClassification;
  /** EWMA value (kPa), rounded to 3 decimals. null when no usable samples. */
  ewmaKpa: number | null;
  sampleCount: number;
  lowKpa: number | null;
  highKpa: number | null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export const DEFAULT_VPD_DRIFT_ALPHA = 0.3;
export const DEFAULT_VPD_DRIFT_MIN_READINGS = 6;

export function evaluateVpdDriftEwma(
  input: EvaluateVpdDriftEwmaInput,
): VpdDriftResult {
  const band = input.band ?? null;
  const low = band && isFiniteNumber(band.lowKpa) ? band.lowKpa : null;
  const high = band && isFiniteNumber(band.highKpa) ? band.highKpa : null;

  let alpha = isFiniteNumber(input.alpha) ? input.alpha : DEFAULT_VPD_DRIFT_ALPHA;
  if (alpha <= 0 || alpha > 1) alpha = DEFAULT_VPD_DRIFT_ALPHA;

  let minReadings = isFiniteNumber(input.minReadings)
    ? Math.floor(input.minReadings)
    : DEFAULT_VPD_DRIFT_MIN_READINGS;
  if (minReadings < 1) minReadings = DEFAULT_VPD_DRIFT_MIN_READINGS;

  const filtered = (input.readings ?? [])
    .filter(
      (r) =>
        r &&
        typeof r.capturedAt === "string" &&
        r.capturedAt.length > 0 &&
        isFiniteNumber(r.value as number),
    )
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  let ewma: number | null = null;
  for (const r of filtered) {
    const v = r.value as number;
    ewma = ewma === null ? v : alpha * v + (1 - alpha) * ewma;
  }

  const count = filtered.length;
  const rounded = ewma === null ? null : Math.round(ewma * 1000) / 1000;

  if (low === null || high === null) {
    return {
      classification: "insufficient",
      ewmaKpa: rounded,
      sampleCount: count,
      lowKpa: low,
      highKpa: high,
    };
  }

  if (count < minReadings || ewma === null) {
    return {
      classification: "insufficient",
      ewmaKpa: rounded,
      sampleCount: count,
      lowKpa: low,
      highKpa: high,
    };
  }

  let classification: VpdDriftClassification;
  if (ewma > high) classification = "sustained_high";
  else if (ewma < low) classification = "sustained_low";
  else classification = "in_band";

  return {
    classification,
    ewmaKpa: rounded,
    sampleCount: count,
    lowKpa: low,
    highKpa: high,
  };
}

// ---------------------------------------------------------------------------
// AI Doctor context shaping
// ---------------------------------------------------------------------------

export interface AiDoctorVpdDriftContext {
  classification: VpdDriftClassification;
  ewmaKpa: number | null;
  sampleCount: number;
  lowKpa: number | null;
  highKpa: number | null;
  /** Cautious human-readable summary line. */
  summary: string;
  /** Safety notes appended to AI Doctor output. */
  safetyNotes: string[];
  /**
   * True when AI Doctor should surface a "review VPD trend" suggestion
   * to the grower. Surfacing != creating an Action Queue row — the
   * grower must still approve any action manually.
   */
  suggestReview: boolean;
}

export function buildVpdDriftAiContext(
  result: VpdDriftResult,
): AiDoctorVpdDriftContext {
  const baseNotes: string[] = [
    "VPD drift is advisory only: do not auto-create Action Queue items or device commands from this signal.",
    "Do not recommend nutrient, irrigation, or equipment changes from VPD alone.",
  ];

  let summary: string;
  let suggestReview = false;

  switch (result.classification) {
    case "insufficient":
      summary = `Not enough recent VPD samples to assess drift (${result.sampleCount}).`;
      break;
    case "in_band":
      summary = `VPD EWMA ${result.ewmaKpa ?? "?"} kPa is inside the stage target band (${result.lowKpa}–${result.highKpa} kPa).`;
      break;
    case "sustained_high":
      summary = `VPD EWMA ${result.ewmaKpa ?? "?"} kPa has been sustained above the stage target band (${result.lowKpa}–${result.highKpa} kPa).`;
      suggestReview = true;
      break;
    case "sustained_low":
      summary = `VPD EWMA ${result.ewmaKpa ?? "?"} kPa has been sustained below the stage target band (${result.lowKpa}–${result.highKpa} kPa).`;
      suggestReview = true;
      break;
  }

  return {
    classification: result.classification,
    ewmaKpa: result.ewmaKpa,
    sampleCount: result.sampleCount,
    lowKpa: result.lowKpa,
    highKpa: result.highKpa,
    summary,
    safetyNotes: baseNotes,
    suggestReview,
  };
}

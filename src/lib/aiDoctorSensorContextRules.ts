/**
 * NEX-6: Map normalized sensor snapshots into AI Doctor context.
 *
 * Pure domain layer that converts a NormalizedSensorReading into cautious,
 * truthful AI Doctor context. No I/O, no Supabase, no React, no hooks.
 *
 * Hard constraints:
 *  - No device control or automation strings.
 *  - No action_queue writes.
 *  - No service_role usage.
 *  - Missing CO₂ does NOT create risk by itself.
 *  - CO₂ is context-only — must not trigger aggressive recommendations.
 *  - Environment readings alone must not recommend nutrient changes.
 *  - Telemetry alone must not claim plant health certainty.
 *  - Invalid critical telemetry NEVER produces a healthy/normal summary.
 *  - Output is deterministic given the same input.
 */

import {
  type NormalizedSensorReading,
  type ReadingSource,
  SOURCE_LABELS,
  isTemperatureValid,
  isHumidityValid,
  isVpdValid,
  isCo2Valid,
  isSoilMoistureValid,
  isPpfdReadingValid,
} from "./sensorReadingNormalizationRules";
import {
  buildVpdDriftAiContext,
  type AiDoctorVpdDriftContext,
  type VpdDriftResult,
} from "./vpdDriftRules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricName =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "ppfd_umol_m2s";

/** Critical metrics whose invalidity blocks healthy/normal summaries. */
const CRITICAL_METRICS: readonly MetricName[] = ["temperature_c", "humidity_pct", "vpd_kpa"];

export interface AiDoctorSensorContext {
  /** Classified source state from NEX-5 normalization. */
  sourceState: ReadingSource;
  /** Human-readable source label. */
  sourceLabel: string;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  /** ISO-8601 timestamp when context was recorded (same as capturedAt). */
  recordedAt: string;
  /** Whether the reading is classified as stale. */
  isStale: boolean;
  /** Whether the reading is classified as invalid. */
  isInvalid: boolean;
  /** Metric names with valid, non-null values usable for AI context. */
  usableMetrics: MetricName[];
  /** Metric names that are null/missing. */
  missingMetrics: MetricName[];
  /** Metric names that have values failing validation guards. */
  invalidMetrics: MetricName[];
  /** How the reading quality impacts AI confidence. */
  confidenceImpact: "none" | "reduced" | "severely-reduced" | "untrusted";
  /** Deterministic summary sentence for AI Doctor prompt context. */
  contextSummary: string;
  /** Safety notes that must accompany AI Doctor output. */
  safetyNotes: string[];
  /**
   * Optional VPD drift context (EWMA against the effective stage band).
   * Present only when the caller supplies a drift evaluation. AI Doctor
   * may surface a review suggestion when `suggestReview` is true, but
   * NEVER creates Action Queue items from this signal alone.
   */
  vpdDrift?: AiDoctorVpdDriftContext;
}

// ---------------------------------------------------------------------------
// Metric Classification Helpers
// ---------------------------------------------------------------------------

const METRIC_KEYS: readonly MetricName[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "ppfd_umol_m2s",
];

const METRIC_VALIDATORS: Record<MetricName, (v: number | null) => boolean> = {
  temperature_c: isTemperatureValid,
  humidity_pct: isHumidityValid,
  vpd_kpa: isVpdValid,
  co2_ppm: isCo2Valid,
  soil_moisture_pct: isSoilMoistureValid,
  ppfd_umol_m2s: isPpfdReadingValid,
};

function classifyMetrics(reading: NormalizedSensorReading): {
  usable: MetricName[];
  missing: MetricName[];
  invalid: MetricName[];
} {
  const usable: MetricName[] = [];
  const missing: MetricName[] = [];
  const invalid: MetricName[] = [];

  for (const key of METRIC_KEYS) {
    const raw = reading[key];
    const value = raw === undefined ? null : raw;
    if (value === null) {
      missing.push(key);
    } else if (!METRIC_VALIDATORS[key](value)) {
      invalid.push(key);
    } else {
      usable.push(key);
    }
  }

  return { usable, missing, invalid };
}

// ---------------------------------------------------------------------------
// Confidence Impact
// ---------------------------------------------------------------------------

function computeConfidenceImpact(
  source: ReadingSource,
  invalidMetrics: MetricName[],
): AiDoctorSensorContext["confidenceImpact"] {
  if (source === "invalid" || invalidMetrics.length > 0) {
    // Any critical metric invalid → untrusted
    const hasCriticalInvalid = invalidMetrics.some((m) =>
      (CRITICAL_METRICS as readonly string[]).includes(m),
    );
    if (hasCriticalInvalid || source === "invalid") {
      return "untrusted";
    }
    return "severely-reduced";
  }
  if (source === "stale") return "reduced";
  if (source === "demo") return "severely-reduced";
  if (source === "imported") return "reduced";
  return "none";
}

// ---------------------------------------------------------------------------
// Context Summary
// ---------------------------------------------------------------------------

function buildContextSummary(
  source: ReadingSource,
  usableMetrics: MetricName[],
  missingMetrics: MetricName[],
  invalidMetrics: MetricName[],
): string {
  if (source === "invalid") {
    return "Sensor telemetry is invalid. Do not rely on these values for health assessment.";
  }

  // If critical metrics are invalid, never produce healthy/normal language
  const hasCriticalInvalid = invalidMetrics.some((m) =>
    (CRITICAL_METRICS as readonly string[]).includes(m),
  );
  if (hasCriticalInvalid) {
    return "Critical sensor metrics failed validation. Environment assessment is not possible.";
  }

  if (source === "stale") {
    return `Sensor reading is stale. Values may not reflect current conditions. ${usableMetrics.length} metric(s) available with caution.`;
  }

  if (source === "demo") {
    return "Sensor data is from demo/synthetic source. Not suitable for real grow decisions.";
  }

  if (source === "manual") {
    return `Manual sensor entry with ${usableMetrics.length} metric(s). Values are user-reported, not hardware-verified.`;
  }

  if (source === "imported") {
    return `Imported sensor data with ${usableMetrics.length} metric(s). Source and timing may not reflect current conditions.`;
  }

  // Live
  if (usableMetrics.length === 0) {
    return "Live reading received but no usable metric values are present.";
  }

  const parts: string[] = [`Live sensor reading with ${usableMetrics.length} usable metric(s).`];
  if (missingMetrics.length > 0) {
    parts.push(`${missingMetrics.length} metric(s) not reported.`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Safety Notes
// ---------------------------------------------------------------------------

function buildSafetyNotes(
  source: ReadingSource,
  usableMetrics: MetricName[],
  missingMetrics: MetricName[],
  invalidMetrics: MetricName[],
): string[] {
  const notes: string[] = [];

  if (source === "invalid") {
    notes.push("Invalid telemetry: do not trust these sensor values.");
  }

  if (source === "stale") {
    notes.push("Reading is stale: conditions may have changed since capture.");
  }

  if (source === "demo") {
    notes.push("Demo data: not from a real grow environment.");
  }

  if (source === "manual") {
    notes.push("Manual entry: values are user-reported and not hardware-verified.");
  }

  const hasCriticalInvalid = invalidMetrics.some((m) =>
    (CRITICAL_METRICS as readonly string[]).includes(m),
  );
  if (hasCriticalInvalid) {
    notes.push("Critical metrics invalid: cannot assess environment health.");
  }

  if (invalidMetrics.length > 0 && !hasCriticalInvalid) {
    notes.push(`Invalid metrics detected: ${invalidMetrics.join(", ")}.`);
  }

  // CO₂ safety: missing CO₂ is not a risk
  const co2Missing = missingMetrics.includes("co2_ppm");
  if (co2Missing) {
    notes.push("CO₂ not reported: this is acceptable and does not indicate risk.");
  }

  // CO₂ present: context-only
  const co2Usable = usableMetrics.includes("co2_ppm");
  if (co2Usable) {
    notes.push("CO₂ is context-only: do not base aggressive recommendations on CO₂ alone.");
  }

  // Environment alone cannot recommend nutrients (PPFD is also an
  // environment metric — light intensity is canopy environment, not
  // tissue nutrition).
  const hasOnlyEnvMetrics = usableMetrics.every((m) =>
    ["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm", "ppfd_umol_m2s"].includes(m),
  );
  if (usableMetrics.length > 0 && hasOnlyEnvMetrics) {
    notes.push(
      "Environment readings only: do not recommend nutrient changes from sensor data alone.",
    );
  }

  // PPFD present: context-only — single light reading must not drive
  // strong readiness or aggressive light/equipment recommendations.
  if (usableMetrics.includes("ppfd_umol_m2s")) {
    notes.push(
      "PPFD is context-only: a single light reading cannot confirm canopy health or readiness.",
    );
  }

  // Telemetry alone cannot claim health certainty
  notes.push("Sensor telemetry alone cannot confirm or deny plant health with certainty.");

  // No device control
  notes.push("Do not suggest device control actions or automation changes.");

  return notes;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Convert a NormalizedSensorReading into AI Doctor context.
 *
 * Pure, deterministic, no side effects.
 */
export function mapSensorReadingToAiDoctorContext(
  reading: NormalizedSensorReading,
): AiDoctorSensorContext {
  const { usable, missing, invalid } = classifyMetrics(reading);
  const confidenceImpact = computeConfidenceImpact(reading.source, invalid);
  const contextSummary = buildContextSummary(reading.source, usable, missing, invalid);
  const safetyNotes = buildSafetyNotes(reading.source, usable, missing, invalid);

  return {
    sourceState: reading.source,
    sourceLabel: SOURCE_LABELS[reading.source],
    capturedAt: reading.captured_at,
    recordedAt: reading.captured_at,
    isStale: reading.source === "stale",
    isInvalid: reading.source === "invalid",
    usableMetrics: usable,
    missingMetrics: missing,
    invalidMetrics: invalid,
    confidenceImpact,
    contextSummary,
    safetyNotes,
  };
}

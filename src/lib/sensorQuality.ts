/**
 * Pure helpers for the scoped Dashboard "Sensor Data Quality" card.
 *
 * Evaluates a normalized SensorSnapshot and returns a qualitative quality
 * verdict with reasons. Strictly read-only. No I/O. No AI. No cultivation
 * advice. No plant-health claims.
 *
 * Language contract:
 *   - "Sensor data looks usable"     (good)
 *   - "Sensor data needs review"     (watch)
 *   - "Sensor data unavailable"      (unavailable)
 */
import { isStale, type SensorSnapshot } from "@/lib/sensorSnapshot";

export type SensorQuality = "good" | "watch" | "unavailable";

export interface SensorQualityResult {
  quality: SensorQuality;
  headline: string;
  reasons: string[];
  suspiciousFields: string[];
}

export const QUALITY_HEADLINE: Record<SensorQuality, string> = {
  good: "Sensor data looks usable",
  watch: "Sensor data needs review",
  unavailable: "Sensor data unavailable",
};

const METRIC_FIELDS: (keyof SensorSnapshot)[] = [
  "temp",
  "rh",
  "vpd",
  "co2",
  "soil",
  "soil_ec",
  "soil_temp",
  "ppfd",
];

/**
 * Evaluate a snapshot. Pure function: no side effects, no Date.now() unless
 * caller omits `now`.
 */
export function evaluateSensorQuality(
  snapshot: SensorSnapshot | null | undefined,
  now: number = Date.now(),
): SensorQualityResult {
  if (!snapshot || snapshot.source === "unavailable") {
    return {
      quality: "unavailable",
      headline: QUALITY_HEADLINE.unavailable,
      reasons: ["No sensor snapshot is available for this grow."],
      suspiciousFields: [],
    };
  }

  const allMissing = METRIC_FIELDS.every((f) => snapshot[f] === null);
  if (allMissing) {
    return {
      quality: "unavailable",
      headline: QUALITY_HEADLINE.unavailable,
      reasons: ["No metric values are present in the latest snapshot."],
      suspiciousFields: [],
    };
  }

  const reasons: string[] = [];
  const suspiciousFields: string[] = [];

  if (isStale(snapshot.ts, now)) {
    reasons.push("Latest reading is stale (older than 30 minutes).");
  }

  const { temp, rh, vpd, soil_ec, ppfd } = snapshot;

  if (temp !== null && (temp < -10 || temp > 60)) {
    reasons.push("Temperature is outside a plausible indoor range.");
    suspiciousFields.push("temp");
  }

  if (rh !== null && (rh === 0 || rh === 1 || rh === 100)) {
    reasons.push("Humidity reads a sensor-fault value (0, 1, or 100%).");
    suspiciousFields.push("rh");
  }
  if (rh !== null && (rh < 0 || rh > 100)) {
    reasons.push("Humidity is outside 0–100%.");
    if (!suspiciousFields.includes("rh")) suspiciousFields.push("rh");
  }

  if (vpd === null) {
    reasons.push("VPD is missing from the latest snapshot.");
    suspiciousFields.push("vpd");
  } else if (vpd < 0 || vpd > 5) {
    reasons.push("VPD is outside a plausible range.");
    suspiciousFields.push("vpd");
  }

  // Soil EC unit mismatch: expect mS/cm (typically 0–6). Values >= 50 strongly
  // suggest µS/cm or raw uncalibrated units (e.g. 1450 instead of 1.45).
  if (soil_ec !== null && soil_ec >= 50) {
    reasons.push(
      "Soil EC looks unit-mismatched (expected mS/cm, got a large value).",
    );
    suspiciousFields.push("soil_ec");
  }
  if (soil_ec !== null && soil_ec < 0) {
    reasons.push("Soil EC is negative.");
    if (!suspiciousFields.includes("soil_ec")) suspiciousFields.push("soil_ec");
  }

  if (ppfd !== null && (ppfd < 0 || ppfd > 3000)) {
    reasons.push("PPFD is negative or implausibly high.");
    suspiciousFields.push("ppfd");
  }

  if (reasons.length === 0) {
    return {
      quality: "good",
      headline: QUALITY_HEADLINE.good,
      reasons: [],
      suspiciousFields: [],
    };
  }

  return {
    quality: "watch",
    headline: QUALITY_HEADLINE.watch,
    reasons,
    suspiciousFields,
  };
}

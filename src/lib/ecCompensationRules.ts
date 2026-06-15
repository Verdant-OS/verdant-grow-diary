/**
 * EC temperature-compensation rules (pure, read-time).
 *
 * Audit reference: docs/audits/ec-temperature-compensation-feasibility.md
 *
 * This module is intentionally read-only and side-effect-free:
 *   - no Supabase imports
 *   - no fetch / network
 *   - no writes, no triggers, no cron
 *   - no mutation of inputs
 *
 * It computes a 25 °C-normalized EC value ONLY when the inputs are
 * unambiguously safe. Anything ambiguous (unknown unit, suspicious
 * magnitude, demo/stale/invalid source, missing pair) returns a
 * structured `blockedReason` so callers cannot accidentally render
 * an unsafe number as ground truth.
 */
import { EC_PLAUSIBLE_MAX, toCanonicalMscm } from "@/lib/ecUnits";
import type { EcUnit } from "@/constants/units";

export type TempUnit = "C" | "F";

/** Source labels Verdant trusts for current-room decisions. */
const TRUSTED_SOURCES = new Set([
  "live",
  "manual",
  "csv", // historical, but unit-trustworthy when paired explicitly
]);
const UNTRUSTED_SOURCES = new Set(["demo", "stale", "invalid"]);

export type EcCompensationBlockedReason =
  | "missing_ec"
  | "missing_temperature"
  | "unknown_ec_unit"
  | "unknown_temperature_unit"
  | "suspicious_ec_magnitude"
  | "suspicious_temperature_magnitude"
  | "unsafe_source"
  | "non_finite_input";

export interface EcCompensationInput {
  ecValue: number | null | undefined;
  ecUnit: EcUnit | string | null | undefined;
  temperatureValue: number | null | undefined;
  temperatureUnit: TempUnit | string | null | undefined;
  /** Per-°C compensation coefficient. Industry convention is ~0.019–0.02. */
  coefficient?: number;
  sourceLabel: string | null | undefined;
}

export interface EcCompensationResult {
  compensatedEc25c: number | null;
  normalizedUnit: "mS/cm" | null;
  method: "linear_25c" | null;
  confidence: "high" | "medium" | "low" | "none";
  warnings: string[];
  blockedReason: EcCompensationBlockedReason | null;
}

const DEFAULT_COEFFICIENT = 0.019;
const TEMP_C_PLAUSIBLE_MIN = 5;
const TEMP_C_PLAUSIBLE_MAX = 45;

function blocked(
  reason: EcCompensationBlockedReason,
  warnings: string[] = [],
): EcCompensationResult {
  return {
    compensatedEc25c: null,
    normalizedUnit: null,
    method: null,
    confidence: "none",
    warnings,
    blockedReason: reason,
  };
}

function isKnownEcUnit(u: unknown): u is EcUnit {
  return u === "mS/cm" || u === "µS/cm" || u === "PPM-500" || u === "PPM-700";
}

function isKnownTempUnit(u: unknown): u is TempUnit {
  return u === "C" || u === "F";
}

export function computeEcCompensation(
  input: EcCompensationInput,
): EcCompensationResult {
  const warnings: string[] = [];
  const source = (input.sourceLabel ?? "").toLowerCase();

  if (!source || UNTRUSTED_SOURCES.has(source) || !TRUSTED_SOURCES.has(source)) {
    return blocked("unsafe_source", [
      `source "${input.sourceLabel ?? "unknown"}" is not trusted for current-room compensation`,
    ]);
  }

  if (input.ecValue === null || input.ecValue === undefined) {
    return blocked("missing_ec");
  }
  if (input.temperatureValue === null || input.temperatureValue === undefined) {
    return blocked("missing_temperature");
  }
  if (!Number.isFinite(input.ecValue) || !Number.isFinite(input.temperatureValue)) {
    return blocked("non_finite_input");
  }

  if (!isKnownEcUnit(input.ecUnit)) {
    return blocked("unknown_ec_unit", [
      `EC unit "${String(input.ecUnit)}" is not in the known set`,
    ]);
  }
  if (!isKnownTempUnit(input.temperatureUnit)) {
    return blocked("unknown_temperature_unit", [
      `temperature unit "${String(input.temperatureUnit)}" must be explicitly "C" or "F"`,
    ]);
  }

  // Magnitude sanity — catches µS/cm-vs-mS/cm mix-ups before compensation.
  const ecMax = EC_PLAUSIBLE_MAX[input.ecUnit];
  if (input.ecValue < 0 || input.ecValue > ecMax) {
    return blocked("suspicious_ec_magnitude", [
      `EC ${input.ecValue} ${input.ecUnit} exceeds plausible max ${ecMax}; possible unit mismatch`,
    ]);
  }

  // Temperature normalization (Fahrenheit only when explicitly labeled).
  const tempC =
    input.temperatureUnit === "F"
      ? (input.temperatureValue - 32) * (5 / 9)
      : input.temperatureValue;

  if (tempC < TEMP_C_PLAUSIBLE_MIN || tempC > TEMP_C_PLAUSIBLE_MAX) {
    return blocked("suspicious_temperature_magnitude", [
      `temperature ${input.temperatureValue} ${input.temperatureUnit} (~${tempC.toFixed(1)} °C) outside plausible grow range`,
    ]);
  }

  const ecMscm = toCanonicalMscm(input.ecValue, input.ecUnit);
  if (ecMscm === null) {
    // Should be unreachable given the unit guard above; defensive only.
    return blocked("unknown_ec_unit");
  }

  const coefficient =
    typeof input.coefficient === "number" && Number.isFinite(input.coefficient)
      ? input.coefficient
      : DEFAULT_COEFFICIENT;

  const denom = 1 + coefficient * (tempC - 25);
  if (denom <= 0 || !Number.isFinite(denom)) {
    return blocked("non_finite_input");
  }

  const compensated = ecMscm / denom;

  // Confidence: highest when caller already passed mS/cm + Celsius live/manual.
  let confidence: EcCompensationResult["confidence"] = "high";
  if (input.ecUnit !== "mS/cm") {
    warnings.push(`EC normalized from ${input.ecUnit} to mS/cm before compensation`);
    confidence = "medium";
  }
  if (input.temperatureUnit === "F") {
    warnings.push("temperature converted from Fahrenheit to Celsius before compensation");
    confidence = confidence === "high" ? "medium" : "low";
  }
  if (source === "csv") {
    warnings.push("source is historical CSV; not current-room truth");
    confidence = "low";
  }

  return {
    compensatedEc25c: compensated,
    normalizedUnit: "mS/cm",
    method: "linear_25c",
    confidence,
    warnings,
    blockedReason: null,
  };
}

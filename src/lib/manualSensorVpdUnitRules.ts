/**
 * Manual VPD entry units.
 *
 * The form can show kPa, hPa, or mbar. Stored sensor readings stay canonical
 * kPa (1 kPa = 10 hPa = 10 mbar). Range checks run on the converted kPa
 * value. The unit choice is component state only — this module does not
 * touch localStorage.
 *
 * Pure. No React, no storage, no clock.
 */

import { VPD_REALISTIC_RANGE } from "@/lib/manualSensorSnapshotQualityRules";
import { validateSensorReadingRange } from "@/lib/sensorReadingRangeValidation";
import type { ManualEntryValidation } from "@/lib/sensorReadingManualEntryRules";

export const MANUAL_VPD_UNITS = ["kPa", "hPa", "mbar"] as const;
export type ManualVpdUnit = (typeof MANUAL_VPD_UNITS)[number];

const KPA_PER_HECTOPASCAL = 10;
const ROUND_DIGITS = 1_000_000;

function assertNever(unit: never): never {
  throw new Error(`Unknown VPD unit: ${String(unit)}`);
}

function roundScaled(value: number): number {
  return Math.round(value * ROUND_DIGITS) / ROUND_DIGITS;
}

/** Convert a typed number into canonical kPa. kPa is left unrounded. */
export function manualVpdToKpa(value: number, unit: ManualVpdUnit): number {
  switch (unit) {
    case "kPa":
      return value;
    case "hPa":
    case "mbar":
      return roundScaled(value / KPA_PER_HECTOPASCAL);
    default:
      return assertNever(unit);
  }
}

function kpaToUnit(kpa: number, unit: ManualVpdUnit): number {
  switch (unit) {
    case "kPa":
      return kpa;
    case "hPa":
    case "mbar":
      return roundScaled(kpa * KPA_PER_HECTOPASCAL);
    default:
      return assertNever(unit);
  }
}

/**
 * String stored on the draft for `vpdKpa`. kPa keeps the typed text so a
 * trailing decimal survives. hPa and mbar store the canonical kPa number.
 */
export function canonicalManualVpdInput(raw: string, unit: ManualVpdUnit): string {
  if (unit === "kPa") return raw;
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return raw;
  return String(manualVpdToKpa(parsed, unit));
}

/** Show a stored kPa string in the selected unit. Blank stays blank. */
export function displayManualVpdFromCanonical(canonical: string, unit: ManualVpdUnit): string {
  if (unit === "kPa" || canonical.trim() === "") return canonical;
  const parsed = Number(canonical.trim());
  if (!Number.isFinite(parsed)) return canonical;
  return String(kpaToUnit(parsed, unit));
}

/**
 * True when two canonical kPa strings are the same reading. `1.20` and `1.2`
 * match. Blank matches only blank. Non-numeric text matches only itself.
 */
export function sameCanonicalManualVpd(left: string, right: string): boolean {
  if (left === right) return true;
  const a = left.trim();
  const b = right.trim();
  if (a === b) return true;
  if (a === "" || b === "") return false;
  const leftNumber = Number(a);
  const rightNumber = Number(b);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  return leftNumber === rightNumber;
}

/** Reexpress the number the grower is looking at when they change units. */
export function reexpressManualVpdInput(
  raw: string,
  from: ManualVpdUnit,
  to: ManualVpdUnit,
): string {
  if (from === to) return raw;
  const trimmed = raw.trim();
  if (trimmed === "") return raw;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return raw;
  return String(kpaToUnit(manualVpdToKpa(parsed, from), to));
}

export function formatEnteredManualVpd(kpa: number, unit: ManualVpdUnit): string {
  if (unit === "kPa") return `${kpa.toFixed(2)} kPa`;
  return `${kpaToUnit(kpa, unit).toFixed(2)} ${unit}`;
}

const KPA_RANGE = /(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\s*kPa/g;
const KPA_AMOUNT = /(-?\d+(?:\.\d+)?)\s*kPa/g;

function formatScaledAmount(kpaText: string): string {
  const scaled = roundScaled(Number(kpaText) * KPA_PER_HECTOPASCAL);
  return String(Math.round(scaled * 100) / 100);
}

/** Rewrite kPa amounts into the selected unit. kPa text is returned unchanged. */
export function relabelManualVpdMessage(message: string, unit: ManualVpdUnit): string {
  if (unit === "kPa") return message;
  return message
    .replace(KPA_RANGE, (_, low: string, high: string) => {
      return `${formatScaledAmount(low)}–${formatScaledAmount(high)} ${unit}`;
    })
    .replace(KPA_AMOUNT, (_, amount: string) => `${formatScaledAmount(amount)} ${unit}`);
}

/**
 * Blocking range message in the unit the grower typed. Null when the
 * converted kPa value is inside the realistic range, blank, non-finite, or
 * negative (the existing "cannot be negative" error covers that case).
 */
export function manualVpdRangeError(typed: string, unit: ManualVpdUnit): string | null {
  const trimmed = typed.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const kpa = manualVpdToKpa(parsed, unit);
  const range = validateSensorReadingRange({ metric: "vpd_kpa", value: kpa });
  if (range.ok) return null;
  const outOfRange = range.issues.some(
    (issue) => issue.severity === "block" && issue.code === "value_out_of_range",
  );
  if (!outOfRange) return null;
  const min = kpaToUnit(VPD_REALISTIC_RANGE.min, unit);
  const max = kpaToUnit(VPD_REALISTIC_RANGE.max, unit);
  return `VPD ${trimmed} ${unit} is outside the accepted range (${min}–${max} ${unit}).`;
}

/**
 * Reject an out-of-range converted VPD before save. The metric is removed so
 * it cannot be inserted. Other metrics stay, but `ok` is false while the
 * range error is present.
 */
export function applyManualVpdRangeGate(
  validation: ManualEntryValidation,
  typed: string,
  unit: ManualVpdUnit,
): ManualEntryValidation {
  const rangeError = manualVpdRangeError(typed, unit);
  const gated: ManualEntryValidation = rangeError
    ? {
        ok: false,
        errors: [...validation.errors, rangeError],
        warnings: validation.warnings.filter((warning) => !warning.includes("unusually high")),
        metrics: validation.metrics.filter((metric) => metric.metric !== "vpd_kpa"),
      }
    : validation;
  if (unit === "kPa") return gated;
  return {
    ...gated,
    errors: gated.errors.map((error) => relabelManualVpdMessage(error, unit)),
    warnings: gated.warnings.map((warning) => relabelManualVpdMessage(warning, unit)),
  };
}

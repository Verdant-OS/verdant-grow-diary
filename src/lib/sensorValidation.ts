/**
 * sensorValidation — pure plausibility checks for grower-entered values.
 *
 * Returns short, neutral messages safe to render in the Quick Log
 * validation preview. Never echoes raw user input.
 *
 * Pure. No I/O. No React.
 */
import { EC_PLAUSIBLE_MAX } from "@/lib/ecUnits";
import { type EcUnit } from "@/constants/units";

export type Severity = "info" | "warning";

export interface PlausibilityIssue {
  code: string;
  message: string;
  severity: Severity;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * pH plausibility for cultivation: realistic range is roughly 3.0–9.0.
 * Outside that band but still inside the chemical 0–14 range → warning.
 */
export function validatePh(value: string | number | null | undefined): PlausibilityIssue | null {
  const n = num(value);
  if (n === null) return null;
  if (n < 3.0 || n > 9.0) {
    return {
      code: "ph:implausible",
      message: "Check pH: outside realistic 3.0–9.0 range.",
      severity: "warning",
    };
  }
  return null;
}

/**
 * EC plausibility relative to the unit the grower chose. Values above
 * `EC_PLAUSIBLE_MAX[unit]` are flagged as "check unit/value" — never
 * silently accepted as a healthy reading.
 */
export function validateEcWithUnit(
  value: string | number | null | undefined,
  unit: EcUnit,
): PlausibilityIssue | null {
  const n = num(value);
  if (n === null) return null;
  if (n < 0) {
    return { code: "ec:negative", message: "EC must be positive.", severity: "warning" };
  }
  const cap = EC_PLAUSIBLE_MAX[unit];
  if (Number.isFinite(cap) && n > cap) {
    return {
      code: "ec:implausible",
      message: "Check EC unit/value — looks too high for the selected unit.",
      severity: "warning",
    };
  }
  return null;
}

/** Air-temp plausibility, Celsius (canonical store). */
export function validateTempC(
  value: string | number | null | undefined,
): PlausibilityIssue | null {
  const n = num(value);
  if (n === null) return null;
  if (n < -10 || n > 60) {
    return {
      code: "temp:implausible",
      message: "Check temperature: outside realistic grow range.",
      severity: "warning",
    };
  }
  return null;
}

/** Humidity plausibility, percent. Also flags stuck 0/100 values. */
export function validateHumidity(
  value: string | number | null | undefined,
): PlausibilityIssue | null {
  const n = num(value);
  if (n === null) return null;
  if (n < 1 || n > 99) {
    return {
      code: "rh:stuck",
      message: "Humidity looks stuck at 0% or 100% — check sensor.",
      severity: "warning",
    };
  }
  return null;
}

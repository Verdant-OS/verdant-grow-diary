/**
 * sensorInputUnitConversion — pure unit handling for grower-entered sensor
 * values.
 *
 * Problem this solves: manual sensor entry historically hardcoded °F. A
 * grower whose display preference is Celsius typing "24" had it read as
 * 24°F and stored as -4.4°C — a plausible-looking but wrong reading that
 * later surfaces to dashboards and the AI Doctor as if it were real.
 *
 * Doctrine:
 *  - The unit is ALWAYS explicit. This module never guesses a unit from a
 *    value's magnitude. A magnitude that looks wrong produces an advisory
 *    hint for the grower, never a silent re-interpretation.
 *  - Canonical storage stays Celsius (`sensor_readings.temperature_c`,
 *    `soil_temp_c`). Conversion happens exactly once, here, at the input
 *    boundary. Nothing downstream re-converts.
 *  - Never invents values. Empty stays empty; unparseable stays invalid.
 *    No field is ever defaulted to zero.
 *
 * Pure. No React, no Supabase, no I/O, no clock reads, no randomness.
 */

import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

/** The unit a grower is typing IN. Distinct from the display preference. */
export type TemperatureInputUnit = "F" | "C";

export const TEMPERATURE_INPUT_UNITS: readonly TemperatureInputUnit[] = ["F", "C"] as const;

export const TEMPERATURE_UNIT_SYMBOL: Record<TemperatureInputUnit, string> = {
  F: "°F",
  C: "°C",
};

/**
 * Typical grow-room air temperature band, expressed in each entry unit.
 * Outside this band the grower gets a warning — never a hard block, because
 * unusual rooms exist and the grower decides.
 */
export const TYPICAL_AIR_TEMP_RANGE: Record<
  TemperatureInputUnit,
  { readonly min: number; readonly max: number }
> = {
  F: { min: 50, max: 100 },
  C: { min: 10, max: 38 },
};

/**
 * Magnitude below/above which an entry is more likely a unit mix-up than a
 * real room. Advisory only.
 */
const UNIT_MISMATCH_F_MAX = 40; // 40°F = 4°C — colder than any live room
const UNIT_MISMATCH_C_MIN = 45; // 45°C = 113°F — hotter than any live room

/** Placeholder shown in the air-temp field for each unit. */
export const AIR_TEMP_PLACEHOLDER: Record<TemperatureInputUnit, string> = {
  F: "75",
  C: "24",
};

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

/** Map the saved display preference onto an input unit. Never throws. */
export function temperatureInputUnitFromPreference(
  preference: TemperatureUnitPreference | string | null | undefined,
): TemperatureInputUnit {
  return preference === "celsius" ? "C" : "F";
}

/** Narrow an unknown candidate to a valid input unit, defaulting to °F. */
export function resolveTemperatureInputUnit(value: unknown): TemperatureInputUnit {
  return value === "C" || value === "F" ? value : "F";
}

export interface ParsedTemperatureInput {
  /** "empty" = grower left it blank (unknown, NOT zero). */
  readonly kind: "empty" | "invalid" | "ok";
  /**
   * The unit the grower typed in. A suffix in the text (`72°F`, `22 °C`)
   * wins over the field's selected unit; otherwise the selected unit is
   * used. This is always explicit after parsing.
   */
  readonly unit: TemperatureInputUnit;
  /** The number exactly as typed, in `unit`. Null unless kind === "ok". */
  readonly enteredValue: number | null;
  /** Canonical Celsius for storage. Null unless kind === "ok". */
  readonly celsius: number | null;
  /** Fahrenheit equivalent, for legacy °F-contract consumers. */
  readonly fahrenheit: number | null;
  /** Advisory hint when the magnitude suggests a unit mix-up. */
  readonly unitMismatchHint: string | null;
  /** Advisory hint when the value is outside the typical grow band. */
  readonly outOfTypicalRangeHint: string | null;
}

const EMPTY_PARSE = (unit: TemperatureInputUnit): ParsedTemperatureInput => ({
  kind: "empty",
  unit,
  enteredValue: null,
  celsius: null,
  fahrenheit: null,
  unitMismatchHint: null,
  outOfTypicalRangeHint: null,
});

/** Round without accumulating float noise. */
function round(value: number, digits: number): number {
  const f = 10 ** digits;
  const scaled = value * f;
  return Number.isFinite(scaled) ? Math.round(scaled) / f : value;
}

/**
 * Strict full-string grammar for a temperature field. The numeric portion
 * accepts plain decimals plus the finite scientific notation older callers
 * already supported. The optional suffix may be F/C, °F/°C, Fahrenheit, or
 * Celsius (case-insensitive), with optional whitespace. Partial parses such
 * as "72°F later" stay invalid.
 */
const TEMPERATURE_INPUT_RE =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s*°?\s*(fahrenheit|celsius|f|c))?$/i;

function parseTemperatureString(
  raw: string,
  fallbackUnit: TemperatureInputUnit,
): { value: number; unit: TemperatureInputUnit } | null {
  const match = TEMPERATURE_INPUT_RE.exec(raw.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = match[2]?.toLowerCase();
  const unit =
    suffix === "c" || suffix === "celsius"
      ? "C"
      : suffix === "f" || suffix === "fahrenheit"
        ? "F"
        : fallbackUnit;
  return { value, unit };
}

/** Format a number with its unit symbol, trimming pointless trailing zeros. */
export function formatTemperatureWithUnit(
  value: number,
  unit: TemperatureInputUnit,
  digits = 1,
): string {
  const rounded = round(value, digits);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
  return `${text}${TEMPERATURE_UNIT_SYMBOL[unit]}`;
}

/** Human-readable typical band, e.g. "50–100°F". */
export function describeTypicalAirTempRange(unit: TemperatureInputUnit): string {
  const band = TYPICAL_AIR_TEMP_RANGE[unit];
  return `${band.min}–${band.max}${TEMPERATURE_UNIT_SYMBOL[unit]}`;
}

/**
 * Advisory unit-mismatch detection. Returns a hint string or null.
 * NEVER re-interprets the value — the grower decides.
 */
export function detectTemperatureUnitMismatch(
  value: number,
  unit: TemperatureInputUnit,
): string | null {
  if (!Number.isFinite(value)) return null;
  if (unit === "F" && value <= UNIT_MISMATCH_F_MAX) {
    return `Air temp ${formatTemperatureWithUnit(value, "F")} looks like a Celsius value entered into the °F field. Double-check this value before saving.`;
  }
  if (unit === "C" && value >= UNIT_MISMATCH_C_MIN) {
    return `Air temp ${formatTemperatureWithUnit(value, "C")} looks like a Fahrenheit value entered into the °C field. Double-check this value before saving.`;
  }
  return null;
}

/**
 * Parse a grower-entered temperature in an explicit unit and convert it to
 * canonical Celsius exactly once.
 *
 * Blank input is `empty` (unknown), never zero. Unparseable input is
 * `invalid` and carries no numeric value — callers must not save it.
 */
export function parseTemperatureInput(
  raw: unknown,
  unit: TemperatureInputUnit,
): ParsedTemperatureInput {
  const safeUnit = resolveTemperatureInputUnit(unit);

  if (raw === null || raw === undefined) return EMPTY_PARSE(safeUnit);
  if (typeof raw === "string" && raw.trim() === "") return EMPTY_PARSE(safeUnit);
  // Only numbers and numeric strings are acceptable. Booleans, arrays, and
  // objects coerce to numbers in JS ([] → 0) and must never slip through as
  // a real reading.
  if (typeof raw !== "number" && typeof raw !== "string") {
    return { ...EMPTY_PARSE(safeUnit), kind: "invalid" };
  }

  const parsed =
    typeof raw === "number"
      ? Number.isFinite(raw)
        ? { value: raw, unit: safeUnit }
        : null
      : parseTemperatureString(raw, safeUnit);
  if (!parsed) {
    return { ...EMPTY_PARSE(safeUnit), kind: "invalid" };
  }

  const { value: n, unit: parsedUnit } = parsed;
  const celsius = parsedUnit === "C" ? n : fahrenheitToCelsius(n);
  const fahrenheit = parsedUnit === "F" ? n : celsiusToFahrenheit(n);
  const band = TYPICAL_AIR_TEMP_RANGE[parsedUnit];

  return {
    kind: "ok",
    unit: parsedUnit,
    enteredValue: n,
    celsius: round(celsius, 6),
    fahrenheit: round(fahrenheit, 6),
    unitMismatchHint: detectTemperatureUnitMismatch(n, parsedUnit),
    outOfTypicalRangeHint:
      n < band.min || n > band.max
        ? `Air temp ${formatTemperatureWithUnit(n, parsedUnit)} is outside the typical ${describeTypicalAirTempRange(parsedUnit)} range.`
        : null,
  };
}

/**
 * Bridge helper: express a grower-entered temperature as a °F input string
 * for the legacy Fahrenheit-contract consumers (advisor, snapshot review,
 * derived-VPD preview). Returns "" for empty/invalid so those consumers keep
 * treating it as unknown rather than zero.
 */
export function toFahrenheitInputString(raw: unknown, unit: TemperatureInputUnit): string {
  const parsed = parseTemperatureInput(raw, unit);
  if (parsed.kind !== "ok" || parsed.fahrenheit === null) return "";
  return String(parsed.fahrenheit);
}

/**
 * Convert a grower-entered temperature to the canonical-Celsius string used
 * by existing form validators and save payloads. An explicit suffix wins over
 * the selected field unit. Blank stays blank; invalid text is returned
 * unchanged so the caller's established validation message still fires.
 */
export function toCelsiusInputString(raw: string, unit: TemperatureInputUnit, digits = 2): string {
  const parsed = parseTemperatureInput(raw, unit);
  if (parsed.kind === "empty") return "";
  if (parsed.kind !== "ok" || parsed.celsius === null) return raw;
  if (parsed.unit === "C" && parsed.enteredValue !== null) {
    return String(parsed.enteredValue);
  }
  return String(round(parsed.celsius, digits));
}

/** Preference-shaped convenience wrapper for React form presenters. */
export function preferredTemperatureToCelsiusInputString(
  raw: string,
  preference: TemperatureUnitPreference,
  digits = 2,
): string {
  return toCelsiusInputString(raw, temperatureInputUnitFromPreference(preference), digits);
}

/**
 * Bridge helper for prefills: render a stored canonical Celsius value in the
 * grower's chosen entry unit. Returns "" when there is nothing to show —
 * never a fabricated zero.
 */
export function celsiusToInputString(
  celsius: number | null | undefined,
  unit: TemperatureInputUnit,
  digits = 2,
): string {
  if (celsius === null || celsius === undefined) return "";
  const n = typeof celsius === "number" ? celsius : Number(celsius);
  if (!Number.isFinite(n)) return "";
  const safeUnit = resolveTemperatureInputUnit(unit);
  const value = safeUnit === "C" ? n : celsiusToFahrenheit(n);
  return String(round(value, digits));
}

/**
 * Re-express an already-typed value when the grower switches the entry unit
 * mid-edit, so "24 °C" becomes "75.2 °F" rather than silently becoming
 * "24 °F". Blank/invalid text is returned unchanged so the grower does not
 * lose what they were typing.
 */
export function convertTemperatureInputString(
  raw: string,
  from: TemperatureInputUnit,
  to: TemperatureInputUnit,
  digits = 2,
): string {
  const fromUnit = resolveTemperatureInputUnit(from);
  const toUnit = resolveTemperatureInputUnit(to);
  if (fromUnit === toUnit) return raw;
  const parsed = parseTemperatureInput(raw, fromUnit);
  if (parsed.kind !== "ok") return raw;
  const value = toUnit === "C" ? parsed.celsius : parsed.fahrenheit;
  if (value === null) return raw;
  return String(round(value, digits));
}

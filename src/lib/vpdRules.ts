/**
 * vpdRules — pure, deterministic air VPD calculation.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control, no Action Queue writes.
 *   - VPD is a DERIVED metric. It is not a sensor source. Callers must
 *     keep the original source label (live/manual/csv/demo/stale/invalid)
 *     and, if they need to mark a value as derived, use a separate field
 *     or metadata — never the main source enum.
 *   - Returns null for missing/invalid/NaN/Infinity inputs, RH outside
 *     0..100, or unrealistic temperatures. Never silently invents data.
 */

export type TempUnit = "C" | "F";

/** Realistic ambient grow-room temperature bounds (Celsius). */
export const AIR_TEMP_MIN_C = -20;
export const AIR_TEMP_MAX_C = 60;

export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface CalculateAirVpdInput {
  tempC?: number | null;
  tempF?: number | null;
  /** Used only when tempF is provided without tempC. Defaults to "C". */
  tempUnit?: TempUnit;
  rhPercent: number | null | undefined;
}

/**
 * Calculate air VPD (kPa) from temperature and relative humidity using
 * the Tetens equation. Result is rounded to 2 decimals. Returns null
 * for any invalid input.
 *
 *   es  = 0.6108 * exp((17.27 * tempC) / (tempC + 237.3))
 *   vpd = es * (1 - RH / 100)
 */
export function calculateAirVpdKpa(input: CalculateAirVpdInput): number | null {
  if (!input) return null;
  const { rhPercent } = input;

  let tempC: number | null = null;
  if (isFiniteNumber(input.tempC)) {
    tempC = input.tempC;
  } else if (isFiniteNumber(input.tempF)) {
    tempC = fahrenheitToCelsius(input.tempF);
  } else if (input.tempUnit === "F" && isFiniteNumber(input.tempC as unknown)) {
    // defensive: tempUnit override applied to tempC
    tempC = fahrenheitToCelsius(input.tempC as number);
  }

  if (!isFiniteNumber(tempC)) return null;
  if (tempC < AIR_TEMP_MIN_C || tempC > AIR_TEMP_MAX_C) return null;

  if (!isFiniteNumber(rhPercent)) return null;
  if (rhPercent < 0 || rhPercent > 100) return null;

  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = es * (1 - rhPercent / 100);
  if (!Number.isFinite(vpd)) return null;
  return Math.round(vpd * 100) / 100;
}

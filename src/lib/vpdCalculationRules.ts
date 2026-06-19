/**
 * VPD calculation rules.
 *
 * Pure, deterministic helper to derive Vapor Pressure Deficit (kPa) from
 * temperature + relative humidity using the Tetens equation. Used by the
 * Sensor Data page (and any view-model) so VPD does NOT require a dedicated
 * sensor reading — it can be derived when both temp and RH are valid.
 *
 * No React. No I/O. No side effects.
 */

export type TemperatureUnit = "C" | "F";

export interface VpdInput {
  /** Temperature value (number). */
  temperature?: number | null;
  /** Temperature unit. Defaults to Celsius. */
  temperatureUnit?: TemperatureUnit;
  /** Relative humidity in percent (0-100). */
  humidity?: number | null;
}

export type VpdState =
  | { kind: "derived"; vpdKpa: number; tempC: number; humidity: number }
  | { kind: "missing"; reason: "needs_temperature_and_humidity" }
  | { kind: "invalid"; reason: "invalid_temperature" | "invalid_humidity" };

const NEEDS_LABEL = "Needs temperature + humidity";

export const VPD_NEEDS_INPUTS_LABEL = NEEDS_LABEL;
export const VPD_DERIVED_NOTE = "Calculated from temperature and humidity.";
export const VPD_ROUNDING_NOTE = "Rounded to 2 decimals.";

/**
 * Format a VPD value as kPa with a stable 2-decimal precision.
 * Returns "—" for invalid/non-finite input rather than throwing.
 */
export function formatVpdKpa(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} kPa`;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/**
 * Saturation vapor pressure (kPa) at a given Celsius temperature.
 * Tetens equation.
 */
export function saturationVaporPressureKpa(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Derive VPD from temperature + RH. Returns a structured state so the UI
 * can render calm "needs inputs" copy instead of a red "Unavailable" badge.
 */
export function deriveVpd(input: VpdInput): VpdState {
  const { temperature, humidity, temperatureUnit = "C" } = input;
  const hasTemp = isFiniteNumber(temperature);
  const hasRh = isFiniteNumber(humidity);
  if (!hasTemp && !hasRh) {
    return { kind: "missing", reason: "needs_temperature_and_humidity" };
  }
  if (!hasTemp || !hasRh) {
    return { kind: "missing", reason: "needs_temperature_and_humidity" };
  }
  const rh = humidity as number;
  if (rh < 0 || rh > 100) {
    return { kind: "invalid", reason: "invalid_humidity" };
  }
  const tempC =
    temperatureUnit === "F"
      ? fahrenheitToCelsius(temperature as number)
      : (temperature as number);
  if (tempC < -40 || tempC > 80) {
    return { kind: "invalid", reason: "invalid_temperature" };
  }
  const svp = saturationVaporPressureKpa(tempC);
  const vpd = svp * (1 - rh / 100);
  // Guard against -0/NaN edge cases.
  const safe = Number.isFinite(vpd) ? Math.max(0, vpd) : 0;
  return {
    kind: "derived",
    vpdKpa: +safe.toFixed(2),
    tempC: +tempC.toFixed(2),
    humidity: rh,
  };
}

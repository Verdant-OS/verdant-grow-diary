/**
 * Temperature unit helpers.
 *
 * Verdant convention:
 *  - User-facing temperature is **Fahrenheit** everywhere
 *    (input labels, chart axes, metric chips, dashboards, plant panels).
 *  - The Supabase `sensor_readings` schema stores Celsius
 *    (metric `temperature_c`, `soil_temp_c`) because the DB trigger
 *    `validate_sensor_reading` only allows those metric names. We do NOT
 *    add `temperature_f` columns; we convert at the display boundary.
 *  - Manual entry collects °F from the grower and converts to °C exactly
 *    once before insert (see `sensorReadingManualEntryRules.ts`).
 *
 * Pure helpers. No I/O, no React, no Supabase.
 */

export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/**
 * Format a stored Celsius value as a user-facing Fahrenheit string.
 * Returns "Unknown" for null/undefined/non-finite — never invents data.
 */
export function formatTempFFromC(
  celsius: number | null | undefined,
  digits = 1,
  unit = "°F",
): string {
  if (celsius === null || celsius === undefined) return "Unknown";
  const n = typeof celsius === "number" ? celsius : Number(celsius);
  if (!Number.isFinite(n)) return "Unknown";
  return `${celsiusToFahrenheit(n).toFixed(digits)}${unit}`;
}

/** Convert a stored Celsius value to Fahrenheit, preserving null. */
export function tempFFromC(celsius: number | null | undefined): number | null {
  if (celsius === null || celsius === undefined) return null;
  const n = typeof celsius === "number" ? celsius : Number(celsius);
  if (!Number.isFinite(n)) return null;
  return celsiusToFahrenheit(n);
}

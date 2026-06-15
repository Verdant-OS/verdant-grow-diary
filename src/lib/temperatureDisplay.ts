/**
 * temperatureDisplay — pure formatters for showing Celsius readings with
 * Fahrenheit-first labels. Celsius is preserved as the calculation basis;
 * Fahrenheit is only computed when a finite Celsius value is provided.
 *
 * Pure. No I/O. No React. No Supabase. No mutation.
 */

export interface DualTempLabel {
  /** e.g. "68°F / 20°C". Null when no safe Celsius value exists. */
  display: string | null;
  fahrenheit: number | null;
  celsius: number | null;
}

const TEMP_C_PLAUSIBLE_MIN = -10;
const TEMP_C_PLAUSIBLE_MAX = 60;

export function formatTempDualF(
  celsius: number | null | undefined,
): DualTempLabel {
  if (
    celsius === null ||
    celsius === undefined ||
    !Number.isFinite(celsius) ||
    (celsius as number) < TEMP_C_PLAUSIBLE_MIN ||
    (celsius as number) > TEMP_C_PLAUSIBLE_MAX
  ) {
    return { display: null, fahrenheit: null, celsius: null };
  }
  const c = celsius as number;
  const f = c * (9 / 5) + 32;
  const cStr = Number.isInteger(c) ? `${c}` : c.toFixed(1);
  const fStr = Math.round(f).toString();
  return {
    display: `${fStr}°F / ${cStr}°C`,
    fahrenheit: f,
    celsius: c,
  };
}

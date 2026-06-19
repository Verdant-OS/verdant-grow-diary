/**
 * temperatureUnitPreference — central, client-side temperature display
 * unit preference. Stored sensor values are CANONICAL CELSIUS and are
 * never mutated by this module — it only affects display.
 *
 * Hard safety rules:
 *  - No I/O beyond `window.localStorage`. No Supabase. No fetch. No AI.
 *  - No schema, RLS, Edge, auth, or migration changes.
 *  - Never invents data. null / undefined / NaN / Infinity → "Unknown".
 *  - Never double-converts: callers tell the formatter whether the
 *    `value` is already Celsius (the canonical store) or already
 *    Fahrenheit (rare — e.g. legacy form input). No silent unit guessing.
 *  - Storage failures (Safari private mode, SSR, blocked storage) fail
 *    OPEN: the default (`fahrenheit`) is returned.
 *
 * Storage key (scoped, opaque enum only): `verdant:temperatureUnit`.
 */

export type TemperatureUnitPreference = "fahrenheit" | "celsius";

export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnitPreference = "fahrenheit";

export const TEMPERATURE_UNIT_OPTIONS: ReadonlyArray<{
  key: TemperatureUnitPreference;
  /** Symbol shown after the number, e.g. "°F". */
  symbol: string;
  /** Short label for radio buttons, e.g. "Fahrenheit (°F)". */
  label: string;
  /** Helper copy. */
  description: string;
  recommended?: boolean;
}> = [
  {
    key: "fahrenheit",
    symbol: "°F",
    label: "Fahrenheit (°F)",
    description:
      "Default. Stored sensor values are unchanged — only the display unit switches.",
    recommended: true,
  },
  {
    key: "celsius",
    symbol: "°C",
    label: "Celsius (°C)",
    description:
      "Show temperatures in °C. Stored sensor values are unchanged.",
  },
];

const STORAGE_KEY = "verdant:temperatureUnit" as const;

/** Pure conversion. Single source of truth. */
export function celsiusToFahrenheit(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

/** Pure conversion. Single source of truth. */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValid(v: unknown): v is TemperatureUnitPreference {
  return v === "fahrenheit" || v === "celsius";
}

export function loadTemperatureUnitPreference(): TemperatureUnitPreference {
  const s = safeStorage();
  if (!s) return DEFAULT_TEMPERATURE_UNIT;
  try {
    const v = s.getItem(STORAGE_KEY);
    return isValid(v) ? v : DEFAULT_TEMPERATURE_UNIT;
  } catch {
    return DEFAULT_TEMPERATURE_UNIT;
  }
}

export function saveTemperatureUnitPreference(
  choice: TemperatureUnitPreference,
): void {
  const s = safeStorage();
  if (!s || !isValid(choice)) return;
  try {
    s.setItem(STORAGE_KEY, choice);
  } catch {
    /* fail open */
  }
}

export function clearTemperatureUnitPreference(): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Resolve any unknown candidate into a valid preference. */
export function resolveTemperatureUnitPreference(
  value: unknown,
): TemperatureUnitPreference {
  return isValid(value) ? value : DEFAULT_TEMPERATURE_UNIT;
}

export interface FormatTemperatureDisplayOptions {
  /**
   * What unit the supplied numeric `value` is already in.
   * - "C" (default): value is canonical Celsius (matches our DB).
   * - "F": value is already Fahrenheit — never re-convert.
   * Use "unknown" when the source is ambiguous → returns "Unknown unit".
   */
  valueUnit?: "C" | "F" | "unknown";
  /** Rounding precision in decimal places. Default: 0 (whole °F/°C). */
  digits?: number;
  /** Optional override of the display unit (else uses preference). */
  unit?: TemperatureUnitPreference;
  /** Copy returned for null/invalid input. Default: "Unknown". */
  unavailableLabel?: string;
}

/**
 * Format a numeric temperature for display, honoring the active unit
 * preference. Never double-converts.
 *
 *  - C → F when preference is fahrenheit
 *  - C → C when preference is celsius
 *  - F → C when preference is celsius
 *  - F → F when preference is fahrenheit (no-op)
 *  - unknown unit → "Unknown unit" (never guesses)
 *
 * Negative values are supported. NaN / Infinity / null / undefined →
 * `unavailableLabel`. Rounding uses `toFixed(digits)` so .5 rounds away
 * from zero per JS engine convention (deterministic and consistent).
 */
export function formatTemperatureDisplay(
  value: number | null | undefined,
  options: FormatTemperatureDisplayOptions = {},
): string {
  const unavailable = options.unavailableLabel ?? "Unknown";
  if (value === null || value === undefined) return unavailable;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return unavailable;

  const valueUnit = options.valueUnit ?? "C";
  if (valueUnit === "unknown") return "Unknown unit";

  const displayUnit = options.unit ?? loadTemperatureUnitPreference();
  const digits = Number.isInteger(options.digits) ? (options.digits as number) : 0;

  let displayed: number;
  if (displayUnit === "fahrenheit") {
    displayed = valueUnit === "F" ? n : celsiusToFahrenheit(n);
  } else {
    displayed = valueUnit === "C" ? n : fahrenheitToCelsius(n);
  }

  const symbol = displayUnit === "fahrenheit" ? "°F" : "°C";
  return `${displayed.toFixed(digits)}${symbol}`;
}

/**
 * Symbol-only helper for chips that already split value/unit slots.
 * Honors the saved preference (or the explicit override).
 */
export function getTemperatureUnitSymbol(
  unit?: TemperatureUnitPreference,
): "°F" | "°C" {
  const displayUnit = unit ?? loadTemperatureUnitPreference();
  return displayUnit === "fahrenheit" ? "°F" : "°C";
}

/**
 * Convert a canonical-Celsius stored value into the preferred display
 * unit as a raw number. Never invents data — returns null on
 * null/undefined/NaN/Infinity. Never double-converts (input is always
 * treated as Celsius — the canonical store).
 */
export function convertCelsiusForDisplay(
  celsius: number | null | undefined,
  unit?: TemperatureUnitPreference,
): number | null {
  if (celsius === null || celsius === undefined) return null;
  const n = typeof celsius === "number" ? celsius : Number(celsius);
  if (!Number.isFinite(n)) return null;
  const displayUnit = unit ?? loadTemperatureUnitPreference();
  return displayUnit === "fahrenheit" ? celsiusToFahrenheit(n) : n;
}

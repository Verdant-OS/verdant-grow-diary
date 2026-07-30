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
 *  - Reads fail open to the default (`fahrenheit`) when storage is unavailable.
 *    Writes return false unless the new state can be confirmed by read-back.
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
    description: "Default. Stored sensor values are unchanged — only the display unit switches.",
    recommended: true,
  },
  {
    key: "celsius",
    symbol: "°C",
    label: "Celsius (°C)",
    description: "Show temperatures in °C. Stored sensor values are unchanged.",
  },
];

const STORAGE_KEY = "verdant:temperatureUnit" as const;

/**
 * Dispatched on `window` whenever the preference is saved/cleared, so
 * same-document listeners (useTemperatureUnitPreference) can react —
 * the native `storage` event only fires in OTHER tabs/windows, never
 * the one that made the change.
 */
export const TEMPERATURE_UNIT_CHANGE_EVENT = "verdant:temperatureUnitChange" as const;

function notifyChange(): void {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(TEMPERATURE_UNIT_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

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

export function saveTemperatureUnitPreference(choice: TemperatureUnitPreference): boolean {
  const s = safeStorage();
  if (!s || !isValid(choice)) return false;
  try {
    s.setItem(STORAGE_KEY, choice);
    if (s.getItem(STORAGE_KEY) !== choice) return false;
  } catch {
    return false;
  }
  notifyChange();
  return true;
}

export function clearTemperatureUnitPreference(): boolean {
  const s = safeStorage();
  if (!s) return false;
  try {
    s.removeItem(STORAGE_KEY);
    if (s.getItem(STORAGE_KEY) !== null) return false;
  } catch {
    return false;
  }
  notifyChange();
  return true;
}

/** Resolve any unknown candidate into a valid preference. */
export function resolveTemperatureUnitPreference(value: unknown): TemperatureUnitPreference {
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
export function getTemperatureUnitSymbol(unit?: TemperatureUnitPreference): "°F" | "°C" {
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

/* ------------------------------------------------------------------ *
 * Typed input parsing — "72°F", "22 °C", "71.6", "-5°C"
 * ------------------------------------------------------------------ */

/** The unit a typed value is expressed in. Distinct from the display preference. */
export type TemperatureInputUnit = "C" | "F";

export type TemperatureInputError =
  /** Nothing to parse (empty / whitespace / null). Not an error to surface loudly. */
  | "empty"
  /** No recognizable number, or trailing junk we refuse to guess about. */
  | "not_a_number"
  /** A unit token was present but is not °C/°F (e.g. "72K", "72°X"). Never guessed. */
  | "unknown_unit";

export interface ParsedTemperatureInput {
  ok: boolean;
  /** Canonical Celsius, ready to store. null unless `ok`. */
  celsius: number | null;
  /** The number exactly as typed, before conversion. null unless `ok`. */
  value: number | null;
  /** Unit the typed value was interpreted in. null unless `ok`. */
  unit: TemperatureInputUnit | null;
  /** True when the text carried no unit and the fallback supplied one. */
  unitAssumed: boolean;
  error: TemperatureInputError | null;
}

/** ° (U+00B0), º masculine ordinal (U+00BA), ˚ ring above (U+02DA), ∘ (U+2218). */
const DEGREE_CHARS = /[°º˚∘]/g;
/**
 * NBSP (U+00A0), narrow NBSP (U+202F), thin space (U+2009) - mobile keyboards
 * and copy-paste produce these freely. Written as escapes because literal
 * characters here are invisible in review and trip `no-irregular-whitespace`.
 */
const EXOTIC_SPACES = /[\u00A0\u202F\u2009]/g;
/** number, optional space, optional unit letter. Anchored: no trailing junk. */
const TEMPERATURE_INPUT_RE = /^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*([A-Za-z]*)$/;

function unitFromPreference(unit: TemperatureUnitPreference): TemperatureInputUnit {
  return unit === "celsius" ? "C" : "F";
}

function fail(error: TemperatureInputError): ParsedTemperatureInput {
  return { ok: false, celsius: null, value: null, unit: null, unitAssumed: false, error };
}

/**
 * Parse a user-typed temperature into canonical Celsius.
 *
 * Accepts an explicit unit suffix in the forms growers actually type:
 *   "72°F"  "72 °F"  "72F"  "72 f"  "22°C"  "22 c"  "-5°C"  "+72F"
 * Degree-symbol lookalikes (º ˚ ∘) and non-breaking spaces are normalized.
 * Either "." or "," may be the decimal separator ("22,5°C").
 *
 * When no unit is typed, `options.assumeUnit` decides — defaulting to the saved
 * display preference, so a grower working in °C who types a bare "22" gets 22°C.
 * That is the ONLY inference made: an unrecognized unit ("72K", "72°X") is
 * rejected rather than guessed, matching this module's no-silent-unit-guessing
 * rule.
 *
 * Returns canonical Celsius because that is what the store holds. Callers
 * validate plausibility separately (see sensorValidation) — this function only
 * decides what the text means, never whether the value is sensible.
 */
export function parseTemperatureInput(
  raw: string | number | null | undefined,
  options: { assumeUnit?: TemperatureInputUnit | TemperatureUnitPreference } = {},
): ParsedTemperatureInput {
  const assumeRaw = options.assumeUnit;
  const assumed: TemperatureInputUnit =
    assumeRaw === "C" || assumeRaw === "F"
      ? assumeRaw
      : unitFromPreference(
          assumeRaw === "celsius" || assumeRaw === "fahrenheit"
            ? assumeRaw
            : loadTemperatureUnitPreference(),
        );

  // A real number needs no parsing — it carries no unit, so it is assumed.
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return fail("not_a_number");
    return {
      ok: true,
      celsius: assumed === "C" ? raw : fahrenheitToCelsius(raw),
      value: raw,
      unit: assumed,
      unitAssumed: true,
      error: null,
    };
  }

  if (raw === null || raw === undefined) return fail("empty");

  const normalized = raw
    .replace(EXOTIC_SPACES, " ")
    .replace(DEGREE_CHARS, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized === "") return fail("empty");

  const m = TEMPERATURE_INPUT_RE.exec(normalized);
  if (!m) return fail("not_a_number");

  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return fail("not_a_number");

  const token = m[2];
  let unit: TemperatureInputUnit;
  let unitAssumed = false;
  if (token === "") {
    unit = assumed;
    unitAssumed = true;
  } else if (/^[Ff]$/.test(token)) {
    unit = "F";
  } else if (/^[Cc]$/.test(token)) {
    unit = "C";
  } else {
    return fail("unknown_unit");
  }

  return {
    ok: true,
    celsius: unit === "C" ? value : fahrenheitToCelsius(value),
    value,
    unit,
    unitAssumed,
    error: null,
  };
}

/**
 * Render a stored canonical-Celsius value for an editable input, in the
 * preferred unit and WITHOUT a unit suffix (the field labels its own unit).
 * Returns "" for missing/invalid input so it can seed a controlled input.
 */
export function formatTemperatureForInput(
  celsius: number | null | undefined,
  options: { unit?: TemperatureUnitPreference; digits?: number } = {},
): string {
  const converted = convertCelsiusForDisplay(celsius, options.unit);
  if (converted === null) return "";
  const digits = Number.isInteger(options.digits) ? (options.digits as number) : 1;
  // Trim a trailing ".0" so a clean 75 does not read as "75.0" in a text field.
  return String(Number(converted.toFixed(digits)));
}

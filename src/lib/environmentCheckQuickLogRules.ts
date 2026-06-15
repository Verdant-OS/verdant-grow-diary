/**
 * environmentCheckQuickLogRules — pure helper for the Quick Log
 * "Environment Check" preset.
 *
 * Hard rules:
 *  - No I/O, no React, no Supabase, no Action Queue, no AI calls, no
 *    device control. Deterministic.
 *  - Never invents values. Never silently infers units.
 *  - Only user-entered, unit-explicit values are persisted.
 *  - Builds an envelope intended for `p_details.environment_check`
 *    through the EXISTING quicklog_save_manual RPC. No schema change.
 *  - Does NOT store the EC @25°C preview as a canonical value. The
 *    preview remains read-only at display time only.
 */
export type EnvironmentCheckWaterTempUnit = "F" | "C";

export interface EnvironmentCheckFormInput {
  /** Room temperature in Fahrenheit (string from form input). */
  roomTempF?: string | null;
  /** Relative humidity percentage 0-100 (string from form input). */
  humidityPct?: string | null;
  /** Optional VPD in kPa (string from form input). */
  vpdKpa?: string | null;
  /** Optional water/root-zone temperature value (string from form input). */
  waterTempValue?: string | null;
  /** Required unit when waterTempValue is provided. No silent inference. */
  waterTempUnit?: EnvironmentCheckWaterTempUnit;
  /** Optional EC in mS/cm (string from form input). */
  ecMscm?: string | null;
  /** Optional short observation note. */
  note?: string | null;
}

export interface EnvironmentCheckEnvelope {
  room_temp_f: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  water_temp_f: number | null;
  water_temp_c: number | null;
  ec_mscm: number | null;
  note: string | null;
}

/** Calm helper copy when no optional measurement has been entered. */
export const ENVIRONMENT_CHECK_HELPER_COPY =
  "Add any measurements you have. A note alone is okay." as const;

/** Section heading rendered above the Environment Check form. */
export const ENVIRONMENT_CHECK_SECTION_TITLE = "Environment check" as const;

/** Plausible humidity bounds (descriptive — never auto-rejects save). */
const HUMIDITY_MIN = 0;
const HUMIDITY_MAX = 100;
/** Plausible room temp bounds in °F (descriptive — never auto-rejects). */
const ROOM_TEMP_F_MIN = -10;
const ROOM_TEMP_F_MAX = 140;
/** Plausible water temperature bounds. */
const WATER_TEMP_F_MIN = 32;
const WATER_TEMP_F_MAX = 110;
const WATER_TEMP_C_MIN = 0;
const WATER_TEMP_C_MAX = 45;
/** Plausible VPD kPa range. */
const VPD_KPA_MIN = 0;
const VPD_KPA_MAX = 4;
/** Plausible EC mS/cm range. */
const EC_MSCM_MIN = 0;
const EC_MSCM_MAX = 10;
/** Note length cap to avoid runaway payloads. */
const NOTE_MAX = 400;

function parseFinite(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function clampOrNull(
  n: number | null,
  min: number,
  max: number,
): number | null {
  if (n === null) return null;
  if (n < min || n > max) return null;
  return n;
}

function clipNote(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= NOTE_MAX) return flat;
  return flat.slice(0, NOTE_MAX - 1).trimEnd() + "…";
}

/** Convert Fahrenheit → Celsius. Pure. */
export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/** Convert Celsius → Fahrenheit. Pure. */
export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

/**
 * Build the structured envelope persisted under
 * `p_details.environment_check`. Returns null when the grower entered
 * nothing meaningful — callers should then omit the envelope entirely.
 *
 * Unit policy:
 *  - room_temp_f / water_temp_f are stored in °F (form's primary unit).
 *  - water_temp_c is stored only when the grower picked °C explicitly,
 *    OR is derived from °F as a paired convenience field so downstream
 *    consumers don't have to re-convert. We never silently infer units.
 */
export function buildEnvironmentCheckDetails(
  input: EnvironmentCheckFormInput,
): EnvironmentCheckEnvelope | null {
  const room_temp_f = clampOrNull(
    parseFinite(input.roomTempF),
    ROOM_TEMP_F_MIN,
    ROOM_TEMP_F_MAX,
  );
  const humidity_pct = clampOrNull(
    parseFinite(input.humidityPct),
    HUMIDITY_MIN,
    HUMIDITY_MAX,
  );
  const vpd_kpa = clampOrNull(parseFinite(input.vpdKpa), VPD_KPA_MIN, VPD_KPA_MAX);

  let water_temp_f: number | null = null;
  let water_temp_c: number | null = null;
  const waterRaw = parseFinite(input.waterTempValue);
  if (waterRaw !== null) {
    if (input.waterTempUnit === "F") {
      water_temp_f = clampOrNull(waterRaw, WATER_TEMP_F_MIN, WATER_TEMP_F_MAX);
      if (water_temp_f !== null) {
        water_temp_c = roundTo(fahrenheitToCelsius(water_temp_f), 2);
      }
    } else if (input.waterTempUnit === "C") {
      water_temp_c = clampOrNull(waterRaw, WATER_TEMP_C_MIN, WATER_TEMP_C_MAX);
      if (water_temp_c !== null) {
        water_temp_f = roundTo(celsiusToFahrenheit(water_temp_c), 1);
      }
    }
    // Missing unit → silently drop. Per safety rule: never infer units.
  }

  const ec_mscm = clampOrNull(parseFinite(input.ecMscm), EC_MSCM_MIN, EC_MSCM_MAX);
  const note = clipNote(input.note);

  if (
    room_temp_f === null &&
    humidity_pct === null &&
    vpd_kpa === null &&
    water_temp_f === null &&
    water_temp_c === null &&
    ec_mscm === null &&
    note === null
  ) {
    return null;
  }

  return {
    room_temp_f,
    humidity_pct,
    vpd_kpa,
    water_temp_f,
    water_temp_c,
    ec_mscm,
    note,
  };
}

/** True when any measurement field has a parseable, in-range value. */
export function hasAnyEnvironmentCheckMeasurement(
  input: EnvironmentCheckFormInput,
): boolean {
  const e = buildEnvironmentCheckDetails({ ...input, note: null });
  return e !== null;
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Resolve the Celsius water-temperature value used by the read-only EC
 * compensation preview. Returns null when the grower has not entered an
 * explicit, in-range water temperature with a known unit.
 */
export function resolvePreviewWaterTempC(
  input: Pick<EnvironmentCheckFormInput, "waterTempValue" | "waterTempUnit">,
): number | null {
  const raw = parseFinite(input.waterTempValue);
  if (raw === null) return null;
  if (input.waterTempUnit === "C") {
    return clampOrNull(raw, WATER_TEMP_C_MIN, WATER_TEMP_C_MAX);
  }
  if (input.waterTempUnit === "F") {
    const f = clampOrNull(raw, WATER_TEMP_F_MIN, WATER_TEMP_F_MAX);
    return f === null ? null : fahrenheitToCelsius(f);
  }
  return null;
}

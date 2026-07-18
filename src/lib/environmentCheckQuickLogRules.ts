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
 *  - Air-sensor plausibility (room temp / humidity / VPD) is reconciled
 *    onto the SINGLE canonical band in sensorReadingNormalizationRules,
 *    the same guards Quick Log v2 uses. Pure import (no I/O) so v1 and v2
 *    can never disagree on what counts as a physically real reading.
 */
import {
  isTemperatureValid,
  isHumidityValid,
  isVpdValid,
} from "./sensorReadingNormalizationRules";

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

// Room temperature, humidity, and VPD deliberately have NO local bounds here.
// They are the three air-sensor metrics shared with Quick Log v2, so their
// plausibility comes from the canonical guards imported above (temperature
// -10..60°C, humidity 0..100, VPD 0..10). Only the v1-specific fields with no
// canonical counterpart keep local bounds.
/** Plausible water temperature bounds (root-zone, not an air-sensor metric). */
const WATER_TEMP_F_MIN = 32;
const WATER_TEMP_F_MAX = 110;
const WATER_TEMP_C_MIN = 0;
const WATER_TEMP_C_MAX = 45;
/** Plausible EC mS/cm range (no canonical counterpart). */
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
  // Air-sensor metrics: keep the value only when it clears the canonical
  // band, else drop to null. This is the pure builder's defensive floor —
  // the UI save path blocks out-of-band values up front via
  // validateEnvironmentCheckSensorBand, so in the real flow build only ever
  // sees in-band values; this guard just guarantees the builder can never
  // emit an out-of-band reading even if called ungated.
  const roomRaw = parseFinite(input.roomTempF);
  const room_temp_f =
    roomRaw !== null && isTemperatureValid(fahrenheitToCelsius(roomRaw))
      ? roomRaw
      : null;
  const humRaw = parseFinite(input.humidityPct);
  const humidity_pct = humRaw !== null && isHumidityValid(humRaw) ? humRaw : null;
  const vpdRaw = parseFinite(input.vpdKpa);
  const vpd_kpa = vpdRaw !== null && isVpdValid(vpdRaw) ? vpdRaw : null;

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

/**
 * Reason codes shared verbatim with Quick Log v2 so a single
 * quickLogReasonToOperatorMessage mapping renders both paths' copy.
 */
export type EnvironmentCheckSensorBandReason =
  | "temperature_out_of_range"
  | "humidity_out_of_range"
  | "vpd_out_of_range";

export type EnvironmentCheckSensorBandResult =
  | { ok: true }
  | { ok: false; reason: EnvironmentCheckSensorBandReason };

/**
 * Blocking plausibility gate for the three air-sensor metrics, reconciled
 * onto the canonical band shared with Quick Log v2. Returns the FIRST
 * offending metric so the surfaced copy is deterministic. Empty / omitted
 * fields are "not provided" and pass — a note-only environment check is
 * always allowed.
 *
 * Non-numeric text parses to null (not provided), preserving v1's existing
 * lenient parsing; this gate only rejects out-of-magnitude values, matching
 * the reconciliation's scope. Water temperature and EC are intentionally
 * out of scope here (no canonical counterpart; unchanged this slice).
 */
export function validateEnvironmentCheckSensorBand(
  input: Pick<EnvironmentCheckFormInput, "roomTempF" | "humidityPct" | "vpdKpa">,
): EnvironmentCheckSensorBandResult {
  const roomRaw = parseFinite(input.roomTempF);
  if (roomRaw !== null && !isTemperatureValid(fahrenheitToCelsius(roomRaw))) {
    return { ok: false, reason: "temperature_out_of_range" };
  }
  const humRaw = parseFinite(input.humidityPct);
  if (humRaw !== null && !isHumidityValid(humRaw)) {
    return { ok: false, reason: "humidity_out_of_range" };
  }
  const vpdRaw = parseFinite(input.vpdKpa);
  if (vpdRaw !== null && !isVpdValid(vpdRaw)) {
    return { ok: false, reason: "vpd_out_of_range" };
  }
  return { ok: true };
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

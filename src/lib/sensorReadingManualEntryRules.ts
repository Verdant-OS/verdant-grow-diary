/**
 * Pure validation + payload helpers for the Manual Sensor Reading form.
 *
 * No I/O, no React, no Supabase. Read-only derivations only.
 *
 * Scope notes:
 *  - `sensor_readings` only accepts the metrics enforced by the DB trigger
 *    `validate_sensor_reading`:
 *      temperature_c, humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct
 *    PPFD / soil_ec / soil_temp / reservoir EC+pH are NOT in the schema and
 *    are intentionally not part of this form. Adding them would require a
 *    migration to extend the trigger; out of scope here.
 *  - Source is always `manual`. Never fakes live data.
 *  - Air temp is entered in °F (grow-room friendly) and converted to °C
 *    before save. Air-only VPD is preview context and is never silently
 *    persisted as though it were verified leaf-to-air VPD.
 */

import { buildManualDeviceId } from "@/lib/manualSensorSourceLabel";
import { classifyPpfd, PPFD_MAX } from "@/lib/ppfdRules";

export type ManualMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "ppfd";

export interface ManualEntryInput {
  /** Air temperature in °F (UI convenience). Converted to °C on save. */
  airTempF?: string | number | null;
  /**
   * Air temperature already in canonical °C — the preferred input now that the
   * form can accept a typed unit ("22°C" / "72°F", see parseTemperatureInput).
   *
   * Takes precedence over `airTempF` when both are supplied. `airTempF` is kept
   * for callers that still hold a Fahrenheit value; supplying only that path
   * behaves exactly as before, warning strings included.
   */
  airTempC?: string | number | null;
  /** Relative humidity %. */
  humidityPct?: string | number | null;
  /** Grower-entered VPD kPa. Air-only estimates are preview-only. */
  vpdKpa?: string | number | null;
  /** CO2 ppm. */
  co2Ppm?: string | number | null;
  /** Soil water content %. */
  soilMoisturePct?: string | number | null;
  /**
   * PPFD µmol/m²/s from a real PAR/quantum meter. Optional.
   * Blank is treated as unknown (NOT zero). Never derived from
   * any other light field. Validated via ppfdRules.
   */
  ppfd?: string | number | null;
}

export interface ManualReadingMetric {
  metric: ManualMetric;
  value: number;
  /** True when computed (e.g. VPD from temp+RH), not entered directly. */
  derived?: boolean;
}

export interface ManualEntryValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: ManualReadingMetric[];
}

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/**
 * Typical grow-room air temperature band in canonical °C — the same band the
 * Fahrenheit path expresses as 50–100°F. Rounded to whole °C for copy; the
 * Fahrenheit branch still compares in °F so its behavior is bit-identical.
 */
const TYPICAL_AIR_TEMP_MIN_C = 10;
const TYPICAL_AIR_TEMP_MAX_C = 38;

/**
 * Saturation vapor pressure (kPa) via Tetens formula.
 * Standard horticulture approximation; not weather-grade.
 */
export function computeVpdKpa(tempC: number, rhPct: number): number {
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = svp * (1 - rhPct / 100);
  return Math.max(0, Math.round(vpd * 1000) / 1000);
}

/** Build & validate the metric list for a manual entry. Pure. */
export function validateManualEntry(input: ManualEntryInput): ManualEntryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metrics: ManualReadingMetric[] = [];

  // Resolve the air temperature into canonical °C, remembering which unit it
  // arrived in so warnings can be worded in the grower's own unit rather than
  // always in °F. `airTempC` wins when both are present.
  const airTempC = toFinite(input.airTempC);
  const airTempF = toFinite(input.airTempF);
  const enteredTempUnit: "C" | "F" | null =
    airTempC !== null ? "C" : airTempF !== null ? "F" : null;
  const tempC =
    airTempC !== null ? airTempC : airTempF !== null ? fahrenheitToCelsius(airTempF) : null;

  const humidity = toFinite(input.humidityPct);
  const vpd = toFinite(input.vpdKpa);
  const co2 = toFinite(input.co2Ppm);
  const soil = toFinite(input.soilMoisturePct);
  const ppfdClass = classifyPpfd(input.ppfd);

  // Hard rejects (impossible values)
  if (humidity !== null && (humidity < 0 || humidity > 100)) {
    errors.push("Humidity must be between 0% and 100%.");
  }
  if (soil !== null && (soil < 0 || soil > 100)) {
    errors.push("Soil water content must be between 0% and 100%.");
  }
  if (co2 !== null && co2 < 0) {
    errors.push("CO₂ ppm cannot be negative.");
  }
  if (vpd !== null && vpd < 0) {
    errors.push("VPD cannot be negative.");
  }
  if (ppfdClass.kind === "invalid") {
    if (ppfdClass.reason === "negative") {
      errors.push("PPFD cannot be negative.");
    } else if (ppfdClass.reason === "implausible_high") {
      errors.push(`PPFD must be between 0 and ${PPFD_MAX} µmol/m²/s.`);
    } else {
      errors.push("PPFD must be a finite number.");
    }
  }

  // Suspicious-but-allowed warnings
  // Typical grow-room air temp is 50–100°F, i.e. 10–38°C. The Fahrenheit branch
  // keeps its original comparison and wording so existing callers and their
  // assertions are untouched; the Celsius branch states the same band in °C
  // rather than quoting a °F range at somebody working in °C.
  if (enteredTempUnit === "F" && airTempF !== null) {
    if (airTempF < 50 || airTempF > 100) {
      warnings.push(`Air temp ${airTempF}°F is outside the typical 50–100°F range.`);
    }
  } else if (enteredTempUnit === "C" && airTempC !== null) {
    if (airTempC < TYPICAL_AIR_TEMP_MIN_C || airTempC > TYPICAL_AIR_TEMP_MAX_C) {
      warnings.push(`Air temp ${airTempC}°C is outside the typical 10–38°C range.`);
    }
  }
  if (humidity !== null && humidity >= 0 && humidity <= 100) {
    if (humidity < 20 || humidity > 90) {
      warnings.push(`Humidity ${humidity}% is outside the typical 20–90% range.`);
    }
  }
  if (vpd !== null && vpd >= 0 && vpd > 2.5) {
    warnings.push(`VPD ${vpd} kPa is unusually high (> 2.5).`);
  }
  if (vpd === null && tempC !== null && humidity !== null && humidity >= 0 && humidity <= 100) {
    warnings.push(
      "Air VPD estimate is preview-only and is not saved as verified VPD. Measure leaf temperature and complete calibration evidence before making a target claim.",
    );
  }

  // Build metric rows for accepted fields (only schema-supported metrics).
  if (tempC !== null) {
    metrics.push({
      metric: "temperature_c",
      value: Math.round(tempC * 100) / 100,
    });
  }
  if (humidity !== null && humidity >= 0 && humidity <= 100) {
    metrics.push({ metric: "humidity_pct", value: humidity });
  }
  if (co2 !== null && co2 >= 0) {
    metrics.push({ metric: "co2_ppm", value: co2 });
  }
  if (soil !== null && soil >= 0 && soil <= 100) {
    metrics.push({ metric: "soil_moisture_pct", value: soil });
  }
  if (vpd !== null && vpd >= 0) {
    metrics.push({ metric: "vpd_kpa", value: vpd });
  }
  if (ppfdClass.kind === "valid") {
    metrics.push({ metric: "ppfd", value: ppfdClass.value });
  }

  if (metrics.length === 0 && errors.length === 0) {
    errors.push("Enter at least one reading.");
  }

  return {
    ok: errors.length === 0 && metrics.length > 0,
    errors,
    warnings,
    metrics,
  };
}

export interface ManualReadingPayload {
  tent_id: string;
  metric: ManualMetric;
  value: number;
  source: "manual";
  ts: string;
  captured_at: string;
  quality: "ok";
  /**
   * Optional `manual:<note>` device id capturing where the grower took
   * the reading (e.g. EcoWitt WH45 CO2/THP Monitor). Omitted when absent so
   * the column stays null. Never makes the reading appear live.
   */
  device_id?: string;
}

/**
 * Build the array of sensor_readings insert payloads for a validated manual
 * entry. Does NOT include user_id — the DB default `auth.uid()` and RLS
 * enforce ownership.
 */
export function buildManualReadingPayloads(args: {
  tentId: string;
  metrics: ManualReadingMetric[];
  ts?: string;
  /** Optional grower-entered device/source note (e.g. "EcoWitt WH45 CO2/THP Monitor"). */
  deviceNote?: string | null;
}): ManualReadingPayload[] {
  const ts = args.ts ?? new Date().toISOString();
  const deviceId = buildManualDeviceId(args.deviceNote ?? null);
  return args.metrics.map((m) => {
    const row: ManualReadingPayload = {
      tent_id: args.tentId,
      metric: m.metric,
      value: m.value,
      source: "manual",
      ts,
      captured_at: ts,
      quality: "ok",
    };
    if (deviceId) row.device_id = deviceId;
    return row;
  });
}

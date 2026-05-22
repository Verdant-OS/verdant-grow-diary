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
 *    before save. VPD is auto-computed from temp+RH when not provided.
 */

export type ManualMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct";

export interface ManualEntryInput {
  /** Air temperature in °F (UI convenience). Converted to °C on save. */
  airTempF?: string | number | null;
  /** Relative humidity %. */
  humidityPct?: string | number | null;
  /** VPD kPa. Optional — auto-derived from temp+RH when omitted. */
  vpdKpa?: string | number | null;
  /** CO2 ppm. */
  co2Ppm?: string | number | null;
  /** Soil water content %. */
  soilMoisturePct?: string | number | null;
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

  const airTempF = toFinite(input.airTempF);
  const humidity = toFinite(input.humidityPct);
  const vpd = toFinite(input.vpdKpa);
  const co2 = toFinite(input.co2Ppm);
  const soil = toFinite(input.soilMoisturePct);

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

  // Suspicious-but-allowed warnings
  if (airTempF !== null) {
    if (airTempF < 50 || airTempF > 100) {
      warnings.push(`Air temp ${airTempF}°F is outside the typical 50–100°F range.`);
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

  // Build metric rows for accepted fields (only schema-supported metrics).
  if (airTempF !== null) {
    metrics.push({
      metric: "temperature_c",
      value: Math.round(fahrenheitToCelsius(airTempF) * 100) / 100,
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
  } else if (airTempF !== null && humidity !== null && humidity >= 0 && humidity <= 100) {
    metrics.push({
      metric: "vpd_kpa",
      value: computeVpdKpa(fahrenheitToCelsius(airTempF), humidity),
      derived: true,
    });
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
  quality: "ok";
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
}): ManualReadingPayload[] {
  const ts = args.ts ?? new Date().toISOString();
  return args.metrics.map((m) => ({
    tent_id: args.tentId,
    metric: m.metric,
    value: m.value,
    source: "manual",
    ts,
    quality: "ok",
  }));
}

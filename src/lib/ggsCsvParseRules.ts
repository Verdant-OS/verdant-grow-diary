/**
 * ggsCsvParseRules — pure, read-only parser/normalizer for a single
 * GGS 3-in-1 Soil Sensor Pro CSV-row shaped input.
 *
 * Hard constraints (stop-ship if violated):
 *  - Pure. No I/O, no React, no Supabase, no fetch, no timers.
 *  - Read-only. NEVER writes sensor_readings, alerts, Action Queue,
 *    AI sessions, or emits device-control commands.
 *  - Treats the row as untrusted. NaN/Infinity/malformed timestamps /
 *    impossible values are rejected — never silently clamped.
 *  - Vendor identity is preserved in `raw_payload.source_app =
 *    "spider_farmer_ggs"`. The canonical `source` is always one of
 *    the Verdant V0 labels: `csv | invalid`. Never `ggs_csv`/`ggs_live`.
 *  - Canonical metrics emitted as long-format insert drafts:
 *      soil_moisture_pct, ec (mS/cm), soil_temp_c (°C, bounds -20..80).
 *  - Soil temperature drafts are gated on the same bounds the DB
 *    trigger enforces: values outside [-20, 80] °C are flagged and
 *    NEVER emitted (no silent clamping). The parsed °C value is always
 *    preserved in raw_payload.parsed_soil_temp_c for audit, and
 *    rejected metrics are reported via `skippedMetrics`.
 *  - Tent context is required. Missing tent → invalid, no drafts.
 *  - `raw_payload` is preserved verbatim for audit; presenter code
 *    MUST NOT render it (guarded by static-safety tests elsewhere).
 */

import { SPIDER_FARMER_GGS_PROVIDER } from "@/lib/spiderFarmerGgsMappingRules";

/** Vendor identity label written into raw_payload.source_app. */
export const GGS_CSV_SOURCE_APP = SPIDER_FARMER_GGS_PROVIDER;

/** Canonical Verdant V0 source labels this parser may emit. */
export type GgsCsvSource = "csv" | "invalid";

/** Canonical metrics this parser may emit as long-format insert drafts. */
export type GgsCsvAllowedMetric = "soil_moisture_pct" | "ec" | "soil_temp_c";

/** Metric names that are parsed but explicitly NOT emitted (e.g. out of bounds). */
export type GgsCsvSkippedMetric = "soil_temp_c";

/** Soil-temperature bounds (°C). Mirrors the DB validate_sensor_reading trigger. */
export const GGS_SOIL_TEMP_C_MIN = -20;
export const GGS_SOIL_TEMP_C_MAX = 80;

export interface GgsCsvReadingDraft {
  /** Canonical metric name accepted by validate_sensor_reading. */
  metric: GgsCsvAllowedMetric;
  /** Normalized numeric value in canonical units. */
  value: number;
  /** Verdant V0 canonical source label. Always "csv" for this parser. */
  source: "csv";
  /** ISO captured_at timestamp. */
  captured_at: string;
  /** Tent scope. Required. */
  tent_id: string;
  /** Optional probe/device id. */
  device_id: string | null;
  /** Audit-only preservation of the original row + provenance. */
  raw_payload: GgsCsvRawPayload;
}


export interface GgsCsvOriginalUnits {
  soil_moisture_pct?: "fraction_0_1" | "percent_0_100";
  ec?: "ms_cm" | "us_cm" | "unknown_large";
  soil_temp_c?: "celsius" | "fahrenheit";
}

export interface GgsCsvRawPayload {
  source_app: typeof GGS_CSV_SOURCE_APP;
  original_row: unknown;
  original_units: GgsCsvOriginalUnits;
  sensor_id?: string;
  parsed_soil_temp_c?: number;
}

export interface GgsCsvParseResult {
  /** Aggregate source verdict for the row. "invalid" when no drafts emitted. */
  source: GgsCsvSource;
  /** Tent scope, when recoverable. */
  tent_id: string | null;
  /** Device/probe id, when recoverable. */
  device_id: string | null;
  /** ISO captured_at, when recoverable. */
  captured_at: string | null;
  /** Long-format insert drafts. Only allowed metrics. */
  drafts: GgsCsvReadingDraft[];
  /** Metrics that were parsed but intentionally not emitted. */
  skippedMetrics: GgsCsvSkippedMetric[];
  /** Sorted, deduplicated warnings. */
  warnings: string[];
  /** Preserved audit payload (also embedded in each draft). */
  raw_payload: GgsCsvRawPayload;
}

export interface ParseGgsCsvRowOptions {
  /** Injected for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
}

const TENT_ALIASES = ["tent_id", "tentId"] as const;
const DEVICE_ALIASES = [
  "device_id",
  "deviceId",
  "sensor_id",
  "sensorId",
  "probe_id",
  "probeId",
] as const;
const CAPTURED_AT_ALIASES = [
  "captured_at",
  "capturedAt",
  "timestamp",
  "ts",
  "time",
] as const;
const MOISTURE_ALIASES = [
  "moisture_vwc",
  "moistureVwc",
  "vwc",
  "soil_moisture",
  "soilMoisture",
  "soil_water_content",
  "soilWaterContent",
  "soil_moisture_pct",
] as const;
const EC_MS_ALIASES = ["ec_ms_cm", "ecMsCm", "soil_ec_mscm", "soilEcMsCm"] as const;
const EC_US_ALIASES = ["ec_us_cm", "ecUsCm"] as const;
const EC_GENERIC_ALIASES = ["soil_ec", "soilEc", "ec"] as const;
const TEMP_C_ALIASES = [
  "soil_temp_c",
  "soilTempC",
  "soil_temperature_c",
  "soilTemperatureC",
  "soil_temp",
  "soilTemp",
  "soil_temperature",
  "soilTemperature",
] as const;
const TEMP_F_ALIASES = ["soil_temp_f", "soilTempF"] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pick(o: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (k in o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  }
  return undefined;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Parse to a finite number. Returns null for NaN/Infinity/non-numeric. */
function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTimestamp(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : null;
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Normalize a single GGS CSV row. Returns drafts ONLY for allowed metrics.
 * Soil temperature is parsed + preserved in raw_payload but never emitted
 * as a draft. Deterministic for the same input + `now`.
 */
export function parseGgsCsvRow(
  input: unknown,
  options: ParseGgsCsvRowOptions = {},
): GgsCsvParseResult {
  const warnings = new Set<string>();
  const skipped = new Set<GgsCsvSkippedMetric>();
  const originalUnits: GgsCsvOriginalUnits = {};
  const raw: Record<string, unknown> = isObject(input) ? input : {};
  if (!isObject(input)) warnings.add("payload_not_object");

  const sensorId = asString(pick(raw, DEVICE_ALIASES));
  const tent_id = asString(pick(raw, TENT_ALIASES));
  const capturedAt = parseTimestamp(pick(raw, CAPTURED_AT_ALIASES));
  if (pick(raw, CAPTURED_AT_ALIASES) !== undefined && capturedAt === null) {
    warnings.add("malformed_timestamp");
  } else if (capturedAt === null) {
    warnings.add("missing_timestamp");
  }
  if (!tent_id) warnings.add("tent_id_missing");

  // Moisture: support 0–1 fraction or 0–100 percent. Reject impossible.
  let soilMoisturePct: number | null = null;
  const rawMoisture = pick(raw, MOISTURE_ALIASES);
  if (rawMoisture !== undefined) {
    const n = toFiniteNumber(rawMoisture);
    if (n === null) {
      warnings.add("soil_moisture_non_numeric");
    } else if (n >= 0 && n <= 1) {
      soilMoisturePct = n * 100;
      originalUnits.soil_moisture_pct = "fraction_0_1";
    } else if (n > 1 && n <= 100) {
      soilMoisturePct = n;
      originalUnits.soil_moisture_pct = "percent_0_100";
    } else {
      warnings.add("soil_moisture_out_of_range");
    }
  }

  // EC: prefer explicit mS/cm, then µS/cm (÷1000), then generic with
  // a safe heuristic. Negative or impossible → reject, never clamp.
  let ecMsCm: number | null = null;
  const rawEcMs = pick(raw, EC_MS_ALIASES);
  const rawEcUs = pick(raw, EC_US_ALIASES);
  const rawEcGeneric = pick(raw, EC_GENERIC_ALIASES);
  if (rawEcMs !== undefined) {
    const n = toFiniteNumber(rawEcMs);
    if (n === null) warnings.add("ec_non_numeric");
    else if (n < 0) warnings.add("ec_negative");
    else if (n > 20) warnings.add("ec_out_of_range");
    else {
      ecMsCm = n;
      originalUnits.ec = "ms_cm";
    }
  } else if (rawEcUs !== undefined) {
    const n = toFiniteNumber(rawEcUs);
    if (n === null) warnings.add("ec_non_numeric");
    else if (n < 0) warnings.add("ec_negative");
    else {
      const converted = n / 1000;
      if (converted > 20) warnings.add("ec_out_of_range");
      else {
        ecMsCm = converted;
        originalUnits.ec = "us_cm";
      }
    }
  } else if (rawEcGeneric !== undefined) {
    const n = toFiniteNumber(rawEcGeneric);
    if (n === null) warnings.add("ec_non_numeric");
    else if (n < 0) warnings.add("ec_negative");
    else if (n >= 100) {
      // Suspiciously large → almost certainly µS/cm leaking through.
      // Per workspace rules: flag, do not silently clamp/convert.
      warnings.add("soil_ec_unit_mismatch_suspected");
      originalUnits.ec = "unknown_large";
    } else if (n > 20) {
      warnings.add("ec_out_of_range");
    } else {
      ecMsCm = n;
      originalUnits.ec = "ms_cm";
    }
  }

  // Soil temperature: parse + bounds-check. Emit a draft only if the
  // value is finite and within the same [-20, 80] °C bounds the DB
  // trigger enforces. Out-of-bounds values are flagged + skipped, never
  // clamped. The parsed °C value is preserved in raw_payload for audit
  // regardless of whether a draft was emitted.
  let parsedSoilTempC: number | undefined;
  let soilTempCEmit: number | null = null;
  const rawTempF = pick(raw, TEMP_F_ALIASES);
  const rawTempC = pick(raw, TEMP_C_ALIASES);
  if (rawTempF !== undefined) {
    const n = toFiniteNumber(rawTempF);
    if (n === null) warnings.add("soil_temp_non_numeric");
    else {
      parsedSoilTempC = ((n - 32) * 5) / 9;
      originalUnits.soil_temp_c = "fahrenheit";
    }
  } else if (rawTempC !== undefined) {
    const n = toFiniteNumber(rawTempC);
    if (n === null) warnings.add("soil_temp_non_numeric");
    else {
      parsedSoilTempC = n;
      originalUnits.soil_temp_c = "celsius";
    }
  }
  if (parsedSoilTempC !== undefined) {
    if (
      parsedSoilTempC < GGS_SOIL_TEMP_C_MIN ||
      parsedSoilTempC > GGS_SOIL_TEMP_C_MAX
    ) {
      warnings.add("soil_temp_out_of_range");
      skipped.add("soil_temp_c");
    } else {
      soilTempCEmit = parsedSoilTempC;
    }
  }

  // Build audit payload (no DB writes happen here).
  const raw_payload: GgsCsvRawPayload = {
    source_app: GGS_CSV_SOURCE_APP,
    original_row: input,
    original_units: originalUnits,
    ...(sensorId ? { sensor_id: sensorId } : {}),
    ...(parsedSoilTempC !== undefined ? { parsed_soil_temp_c: parsedSoilTempC } : {}),
  };

  // Only emit drafts when we have BOTH tent + valid timestamp + a value.
  const drafts: GgsCsvReadingDraft[] = [];
  const canEmit = !!tent_id && !!capturedAt;
  if (canEmit && soilMoisturePct !== null) {
    drafts.push({
      metric: "soil_moisture_pct",
      value: soilMoisturePct,
      source: "csv",
      captured_at: capturedAt,
      tent_id,
      device_id: sensorId,
      raw_payload,
    });
  }
  if (canEmit && ecMsCm !== null) {
    drafts.push({
      metric: "ec",
      value: ecMsCm,
      source: "csv",
      captured_at: capturedAt,
      tent_id,
      device_id: sensorId,
      raw_payload,
    });
  }
  if (canEmit && soilTempCEmit !== null) {
    drafts.push({
      metric: "soil_temp_c",
      value: soilTempCEmit,
      source: "csv",
      captured_at: capturedAt,
      tent_id,
      device_id: sensorId,
      raw_payload,
    });
  }


  const source: GgsCsvSource = drafts.length > 0 ? "csv" : "invalid";

  return {
    source,
    tent_id,
    device_id: sensorId,
    captured_at: capturedAt,
    drafts,
    skippedMetrics: [...skipped].sort(),
    warnings: [...warnings].sort(),
    raw_payload,
  };
}

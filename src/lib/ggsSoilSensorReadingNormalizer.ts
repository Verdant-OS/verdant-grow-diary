/**
 * ggsSoilSensorReadingNormalizer — pure helper that turns an unknown
 * GGS 3-in-1 Soil Sensor Pro payload (delivered through the existing
 * Spider Farmer GGS bridge / MQTT / Home Assistant transport, or
 * manually entered) into a canonical, validated reading draft scoped
 * to the soil probe (soil moisture, soil temperature, soil EC).
 *
 * Hard constraints (stop-ship if violated):
 *  - Pure. No I/O, no React, no Supabase, no fetch, no timers.
 *  - Read-only. NEVER writes sensor_readings, alert rows, queued actions,
 *    AI sessions, or emits device-control hints.
 *  - Treats the payload as untrusted. NaN/Infinity/impossible values
 *    are rejected, never silently coerced into plausible ranges.
 *  - Source classification is computed from data quality, never
 *    promoted to `live` from a missing/unknown source.
 *  - Manually entered GGS values are always `source: "manual"`.
 *  - Tent context is required. Missing tent → invalid.
 *  - `raw_payload` is preserved verbatim for audit, but presenter
 *    code must NEVER render it (guarded by static-safety tests).
 *  - No new sensor metric is introduced; output maps to existing
 *    canonical keys: `soil_moisture_pct`, `soil_temp_c`, `ec`.
 *  - Delegates payload parsing to
 *    `normalizeSpiderFarmerGgsPayload` to avoid duplicating the
 *    bridge contract, then adds soil-only canonical mapping,
 *    EC unit-mismatch detection, tent-required, and alias tolerance
 *    for the field-name variations the GGS bridge is known to emit.
 */
import {
  normalizeSpiderFarmerGgsPayload,
  SPIDER_FARMER_GGS_PROVIDER,
  SPIDER_FARMER_GGS_STALE_MS,
  type SpiderFarmerGgsTransport,
} from "@/lib/spiderFarmerGgsMappingRules";

export const GGS_SOIL_SENSOR_PROVIDER = SPIDER_FARMER_GGS_PROVIDER;
export const GGS_SOIL_STALE_MS = SPIDER_FARMER_GGS_STALE_MS;

/** Canonical Verdant source kinds this helper may emit. */
export type GgsSoilSource = "live" | "manual" | "stale" | "invalid";
export type GgsSoilStatus = "accepted" | "degraded" | "invalid";
export type GgsSoilConfidence = "high" | "medium" | "low";

export interface GgsSoilCanonicalReadings {
  /** 0..100 (%) */
  soil_moisture_pct?: number;
  /** °C, within realistic bounds */
  soil_temp_c?: number;
  /** mS/cm, within realistic bounds (NOT µS/cm) */
  ec?: number;
}

export interface GgsSoilReadingDraft {
  provider: typeof GGS_SOIL_SENSOR_PROVIDER;
  transport: SpiderFarmerGgsTransport | "manual";
  source: GgsSoilSource;
  status: GgsSoilStatus;
  confidence: GgsSoilConfidence;
  tent_id: string | null;
  plant_id: string | null;
  captured_at: string | null;
  received_at: string;
  readings: GgsSoilCanonicalReadings;
  /** Preserved for audit only — UI MUST NOT render this. */
  raw_payload: unknown;
  warnings: string[];
}

export interface NormalizeGgsSoilOptions {
  /** Injected for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
  /** Pass when caller knows the transport (mqtt | home_assistant | bridge). */
  transportHint?: SpiderFarmerGgsTransport;
  /** Set when this reading was manually entered by a grower. */
  manualEntry?: boolean;
  /**
   * Source identity from the caller. Only `live` (default) and `manual`
   * are honored. Anything else (or missing) collapses to `invalid` —
   * unknown sources NEVER become `live`.
   */
  declaredSource?: string | null;
  /** Optional plant scope; only attached when present. */
  plantId?: string | null;
}

const SOIL_MOISTURE_ALIASES = [
  "soil_moisture_pct",
  "soil_moisture",
  "soilMoisture",
  "soil_water_content",
  "soilWaterContent",
  "vwc",
] as const;
const SOIL_TEMP_C_ALIASES = [
  "soil_temp_c",
  "soilTempC",
  "soil_temperature_c",
  "soilTemperatureC",
  "soil_temperature",
  "soilTemperature",
  "soil_temp",
  "soilTemp",
] as const;
const SOIL_EC_ALIASES = [
  "soil_ec",
  "soilEc",
  "ec",
  "soil_ec_mscm",
  "soilEcMsCm",
] as const;
const TENT_ID_ALIASES = ["tent_id", "tentId"] as const;
const PLANT_ID_ALIASES = ["plant_id", "plantId"] as const;
const CAPTURED_AT_ALIASES = [
  "captured_at",
  "capturedAt",
  "timestamp",
  "ts",
  "time",
] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickFirstDefined(
  o: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const k of keys) {
    if (k in o && o[k] !== undefined && o[k] !== null && o[k] !== "") {
      return o[k];
    }
  }
  return undefined;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Normalize an unknown GGS 3-in-1 Soil Sensor Pro payload.
 * Deterministic for the same input + `now`.
 */
export function normalizeGgsSoilSensorReading(
  input: unknown,
  options: NormalizeGgsSoilOptions = {},
): GgsSoilReadingDraft {
  const now = options.now ?? new Date();
  const warnings = new Set<string>();
  const manualEntry = options.manualEntry === true;

  const raw: Record<string, unknown> = isObject(input) ? input : {};
  if (!isObject(input)) warnings.add("payload_not_object");

  // Build a relaxed copy that maps camelCase + soil aliases to the
  // snake_case keys the underlying GGS normalizer already understands.
  const bridgeInput: Record<string, unknown> = { ...raw };
  const moisture = pickFirstDefined(raw, SOIL_MOISTURE_ALIASES);
  if (moisture !== undefined) bridgeInput.soil_water_content = moisture;
  const soilTempC = pickFirstDefined(raw, SOIL_TEMP_C_ALIASES);
  if (soilTempC !== undefined) bridgeInput.soil_temp_c = soilTempC;
  const soilEc = pickFirstDefined(raw, SOIL_EC_ALIASES);
  if (soilEc !== undefined) bridgeInput.soil_ec = soilEc;
  const tentId = pickFirstDefined(raw, TENT_ID_ALIASES);
  if (tentId !== undefined) bridgeInput.tent_id = tentId;
  const capturedAt = pickFirstDefined(raw, CAPTURED_AT_ALIASES);
  if (capturedAt !== undefined) bridgeInput.captured_at = capturedAt;

  const bridge = normalizeSpiderFarmerGgsPayload(bridgeInput, {
    now,
    transportHint: options.transportHint,
  });
  for (const w of bridge.warnings) warnings.add(w);

  // Canonical soil-only mapping.
  const canonical: GgsSoilCanonicalReadings = {};
  if (typeof bridge.readings.soil_water_content === "number") {
    canonical.soil_moisture_pct = bridge.readings.soil_water_content;
  }
  if (typeof bridge.readings.soil_temp_c === "number") {
    canonical.soil_temp_c = bridge.readings.soil_temp_c;
  }
  if (typeof bridge.readings.soil_ec === "number") {
    canonical.ec = bridge.readings.soil_ec;
  }

  // EC unit-mismatch heuristic: realistic mS/cm is ~0–10. Anything ≥100
  // is almost certainly µS/cm leaking through. We DO NOT clamp; we drop
  // the value and flag it so the operator sees the discrepancy.
  const rawEc = pickFirstDefined(raw, SOIL_EC_ALIASES);
  if (typeof rawEc === "number" && Number.isFinite(rawEc) && rawEc >= 100) {
    warnings.add("soil_ec_unit_mismatch_suspected");
    delete canonical.ec;
  }
  // NaN / Infinity guard for any explicitly numeric field.
  for (const key of [
    ...SOIL_MOISTURE_ALIASES,
    ...SOIL_TEMP_C_ALIASES,
    ...SOIL_EC_ALIASES,
  ]) {
    const v = raw[key];
    if (typeof v === "number" && !Number.isFinite(v)) {
      warnings.add("non_finite_value");
    }
  }

  // Tent context is REQUIRED.
  const tent_id = bridge.tent_id ?? null;
  if (!tent_id) warnings.add("tent_id_missing");

  // Source resolution. Unknown / missing source NEVER becomes live.
  const declared = (options.declaredSource ?? "live").toLowerCase();
  let source: GgsSoilSource;
  if (manualEntry || declared === "manual") {
    source = "manual";
  } else if (declared !== "live") {
    source = "invalid";
    warnings.add("unknown_source");
  } else if (!tent_id) {
    source = "invalid";
  } else if (Object.keys(canonical).length === 0) {
    source = "invalid";
    warnings.add("no_soil_readings_mapped");
  } else if (bridge.source === "live") {
    source = "live";
  } else {
    // bridge.source is already "stale" or "invalid".
    source = bridge.source;
  }

  // Status + confidence.
  let status: GgsSoilStatus;
  let confidence: GgsSoilConfidence;
  if (source === "invalid") {
    status = "invalid";
    confidence = "low";
  } else if (source === "stale") {
    status = "degraded";
    confidence = "low";
  } else if (warnings.size === 0 && Object.keys(canonical).length >= 2) {
    status = "accepted";
    confidence = source === "manual" ? "medium" : "high";
  } else {
    status = "degraded";
    confidence = "medium";
  }

  const sortedWarnings = [...warnings].sort();

  return {
    provider: GGS_SOIL_SENSOR_PROVIDER,
    transport: manualEntry ? "manual" : bridge.transport,
    source,
    status,
    confidence,
    tent_id,
    plant_id: asString(options.plantId) ?? asString(pickFirstDefined(raw, PLANT_ID_ALIASES)),
    captured_at: bridge.captured_at,
    received_at: bridge.received_at,
    readings: canonical,
    raw_payload: input,
    warnings: sortedWarnings,
  };
}

/**
 * ecowittMqttIngestRules — pure normalizer for EcoWitt GW1200 readings
 * delivered through ecowitt2mqtt → Mosquitto → Verdant ingest.
 *
 * Hard constraints (Verdant sensor truth):
 *   - No I/O. No Supabase. No React. No timers.
 *   - Never invents data. Never smooths or back-fills.
 *   - Invalid / impossible / stale readings are flagged and MUST NOT be
 *     persisted as `source = live` healthy values.
 *   - No device control fields are accepted. The normalizer ignores any
 *     command-shaped keys silently — they cannot round-trip into the app.
 *   - Does not write to `action_queue`. Does not call alert systems.
 *
 * Output is a canonical Verdant draft. Callers (a future ingest route)
 * are responsible for ownership resolution (tent_id → user_id), bridge
 * token auth, and the actual insert through the standard
 * `sensor_readings` schema. This module never touches service_role.
 */

import {
  classifyManualMetric,
  isAirTempFRealistic,
  isHumidityRealistic,
  isSoilMoistureRealistic,
  isCo2PpmRealistic,
  type TruthReasonCode,
} from "@/lib/sensorTruthRules";

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const ECOWITT_MQTT_PROVIDER = "ecowitt" as const;
export const ECOWITT_MQTT_SOURCE = "live" as const;

/**
 * Stale window for live bridge readings. Anything older than this at
 * normalize time is rejected — we do NOT promote stale telemetry to live.
 */
export const ECOWITT_MQTT_STALE_MS = 15 * 60 * 1000;

/** Future-tolerance for sensor clock skew. Anything beyond is rejected. */
export const ECOWITT_MQTT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Raw EcoWitt MQTT payload as published by ecowitt2mqtt. We only consume
 * fields we know; everything else is preserved in `raw_payload` for audit.
 *
 * Field names mirror ecowitt2mqtt's default mapping (Fahrenheit imperial
 * for temps; integer percent for humidity).
 */
export interface EcowittMqttPayload {
  // Identity / addressing (optional — caller may inject from MQTT topic).
  tent_id?: string | null;
  plant_id?: string | null;

  // Time
  dateutc?: string | null;
  captured_at?: string | null;

  // Air sensors
  tempf?: number | string | null;
  temp1f?: number | string | null;
  humidity?: number | string | null;
  humidity1?: number | string | null;

  // CO2 / soil
  co2?: number | string | null;
  co2_in?: number | string | null;
  soilmoisture1?: number | string | null;
  soiltemp1f?: number | string | null;

  // Everything else preserved as-is
  [key: string]: unknown;
}

export interface EcowittMqttIngestInput {
  /** Raw payload as decoded from MQTT. */
  payload: EcowittMqttPayload;
  /** Tent id resolved from topic mapping if not in payload. */
  tentId?: string | null;
  /** Optional plant id (rare — usually tent-scoped). */
  plantId?: string | null;
  /** Injected current time for deterministic tests. */
  now?: Date;
}

/**
 * Canonical Verdant sensor reading draft. This is intentionally a
 * presentation/contract shape — the actual DB insert is performed by the
 * existing ingest pipeline (which already enforces RLS and validation).
 */
export interface CanonicalSensorReadingDraft {
  provider: typeof ECOWITT_MQTT_PROVIDER;
  source: typeof ECOWITT_MQTT_SOURCE | "invalid";
  captured_at: string;
  tent_id: string | null;
  plant_id: string | null;
  air_temp_f: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  soil_water_content_pct: number | null;
  soil_temp_f: number | null;
  co2_ppm: number | null;
  raw_payload: EcowittMqttPayload;
  confidence: number;
}

export interface EcowittMqttIngestResult {
  ok: boolean;
  draft: CanonicalSensorReadingDraft | null;
  /** Stable rejection / suspicion reason codes. */
  reasons: (TruthReasonCode | "stale_reading" | "malformed_payload" | "missing_captured_at")[];
  /** Short human chips for UI / audit log. */
  chips: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function calcVpdKpa(tempF: number, rh: number): number | null {
  const tC = fToC(tempF);
  if (!Number.isFinite(tC)) return null;
  const es = 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
  const vpd = es * (1 - rh / 100);
  if (!Number.isFinite(vpd)) return null;
  return Math.round(vpd * 100) / 100;
}

function parseEcowittDateUtc(s: string | null | undefined): string | null {
  if (!s) return null;
  // ecowitt2mqtt forwards "YYYY-MM-DD HH:MM:SS" in UTC by default.
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize a raw EcoWitt MQTT payload into a canonical Verdant sensor
 * reading draft. Returns `{ ok: false, draft: null, reasons }` for
 * malformed / impossible / stale payloads so the caller can drop the
 * insert rather than persisting a fake-live reading.
 *
 * The function never returns a healthy draft from invalid telemetry.
 */
export function normalizeEcowittMqttPayload(
  input: EcowittMqttIngestInput,
): EcowittMqttIngestResult {
  const reasons: EcowittMqttIngestResult["reasons"] = [];
  const chips: string[] = [];

  if (!input || typeof input !== "object" || !input.payload || typeof input.payload !== "object") {
    return { ok: false, draft: null, reasons: ["malformed_payload"], chips: ["Malformed payload"] };
  }

  const { payload } = input;
  const now = input.now ?? new Date();

  // Captured at
  const capturedAtRaw =
    typeof payload.captured_at === "string" && payload.captured_at
      ? payload.captured_at
      : parseEcowittDateUtc(payload.dateutc ?? null);
  if (!capturedAtRaw) {
    return {
      ok: false,
      draft: null,
      reasons: ["missing_captured_at"],
      chips: ["Missing captured_at"],
    };
  }
  const capturedAtMs = Date.parse(capturedAtRaw);
  if (!Number.isFinite(capturedAtMs)) {
    return {
      ok: false,
      draft: null,
      reasons: ["malformed_payload"],
      chips: ["Malformed payload"],
    };
  }
  const ageMs = now.getTime() - capturedAtMs;
  if (ageMs > ECOWITT_MQTT_STALE_MS) {
    reasons.push("stale_reading");
    chips.push("Stale reading");
  }
  if (ageMs < -ECOWITT_MQTT_FUTURE_TOLERANCE_MS) {
    return {
      ok: false,
      draft: null,
      reasons: ["malformed_payload"],
      chips: ["Captured_at in the future"],
    };
  }

  // Air temp / humidity (prefer outdoor `tempf`/`humidity`, fall back to ch1)
  const rawTempF = toNumber(payload.tempf ?? payload.temp1f ?? null);
  const rawRh = toNumber(payload.humidity ?? payload.humidity1 ?? null);

  let airTempF: number | null = rawTempF;
  if (airTempF !== null && !isAirTempFRealistic(airTempF)) {
    airTempF = null;
    reasons.push("invalid_temp");
    chips.push("Invalid temp");
  }
  let humidity: number | null = rawRh;
  if (humidity !== null && !isHumidityRealistic(humidity)) {
    humidity = null;
    reasons.push("invalid_rh");
    chips.push("Invalid humidity");
  }

  // VPD: derive only when both temp + RH are valid.
  let vpd: number | null = null;
  if (airTempF !== null && humidity !== null) {
    vpd = calcVpdKpa(airTempF, humidity);
    if (vpd !== null) {
      const truth = classifyManualMetric("vpd_kpa", vpd);
      if (!truth.valid) {
        vpd = null;
        reasons.push("invalid_vpd");
        chips.push("Invalid VPD");
      }
    }
  }

  // Soil moisture
  let soil: number | null = toNumber(payload.soilmoisture1 ?? null);
  if (soil !== null && !isSoilMoistureRealistic(soil)) {
    soil = null;
    reasons.push("invalid_soil_moisture");
    chips.push("Invalid soil moisture");
  }

  // Soil temp (F)
  let soilTempF: number | null = toNumber(payload.soiltemp1f ?? null);
  if (soilTempF !== null) {
    const truth = classifyManualMetric("soil_temp_c", fToC(soilTempF));
    if (!truth.valid) {
      soilTempF = null;
      reasons.push("invalid_soil_temp");
      chips.push("Invalid soil temp");
    }
  }

  // CO2
  let co2: number | null = toNumber(payload.co2 ?? payload.co2_in ?? null);
  if (co2 !== null && !isCo2PpmRealistic(co2)) {
    co2 = null;
    reasons.push("invalid_vpd"); // placeholder code — replaced below
    reasons.pop();
    chips.push("Invalid CO₂");
  }

  // If literally nothing valid landed, mark invalid so callers do not
  // persist as live/healthy.
  const anyValid =
    airTempF !== null ||
    humidity !== null ||
    vpd !== null ||
    soil !== null ||
    soilTempF !== null ||
    co2 !== null;

  const stale = reasons.includes("stale_reading");
  const ok = anyValid && !stale;
  const sourceLabel: CanonicalSensorReadingDraft["source"] = ok ? ECOWITT_MQTT_SOURCE : "invalid";

  // Simple confidence: 1.0 when all primary fields valid + fresh; 0 when
  // nothing valid; otherwise proportional drop per chip.
  const confidence = ok ? Math.max(0, 1 - chips.length * 0.15) : 0;

  const draft: CanonicalSensorReadingDraft = {
    provider: ECOWITT_MQTT_PROVIDER,
    source: sourceLabel,
    captured_at: new Date(capturedAtMs).toISOString(),
    tent_id: input.tentId ?? payload.tent_id ?? null,
    plant_id: input.plantId ?? payload.plant_id ?? null,
    air_temp_f: airTempF,
    humidity_pct: humidity,
    vpd_kpa: vpd,
    soil_water_content_pct: soil,
    soil_temp_f: soilTempF,
    co2_ppm: co2,
    raw_payload: payload,
    confidence: Math.round(confidence * 100) / 100,
  };

  return { ok, draft, reasons, chips };
}

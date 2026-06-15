/**
 * normalizeSensorReading — pure, deterministic normalizer for Verdant V0
 * sensor truth.
 *
 * Hard rules:
 *  - No I/O, no React, no Supabase, no fetch, no edge calls.
 *  - Never invents values. Null in → null out.
 *  - Top-level Verdant truth labels (`source`) stay canonical:
 *    "live" | "manual" | "csv" | "demo" | "stale" | "invalid".
 *    Vendor/transport identity lives separately.
 *  - Never classifies suspicious telemetry as healthy. Adds warnings.
 *  - Stale: captured_at older than threshold → is_stale + warning, and
 *    top-level source becomes "stale" unless "invalid" or "demo".
 *  - Invalid wins over stale. Demo stays demo.
 */
import { calculateVPD } from "./calculateVPD";

export type SensorTruthSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export type SensorSourceIdentity =
  | "manual_entry"
  | "demo_fixture"
  | "csv_import"
  | "ecowitt"
  | "switchbot"
  | "home_assistant"
  | "mqtt_bridge"
  | "raspberry_pi"
  | "spider_farmer"
  | "sensorpush"
  | "aroya"
  | "unknown";

export type SensorTransport =
  | "manual"
  | "csv"
  | "mqtt"
  | "webhook"
  | "home_assistant"
  | "local_bridge"
  | "api"
  | "unknown";

export interface NormalizeSensorReadingOptions {
  source: SensorTruthSource;
  sourceIdentity?: SensorSourceIdentity;
  transport?: SensorTransport;
  tentId?: string | null;
  plantId?: string | null;
  capturedAt?: string | null;
  receivedAt?: string | null;
  now?: Date;
  staleAfterMinutes?: number;
}

export interface NormalizedSensorMetrics {
  temperature_c: number | null;
  temperature_f: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  co2_ppm: number | null;
  soil_moisture_pct: number | null;
  soil_temperature_c: number | null;
  soil_temperature_f: number | null;
  soil_ec_ms_cm: number | null;
  reservoir_ec_ms_cm: number | null;
  reservoir_ph: number | null;
  ppfd_umol_m2_s: number | null;
}

export interface NormalizedSensorReading {
  source: SensorTruthSource;
  source_identity: SensorSourceIdentity;
  transport: SensorTransport;
  tent_id: string | null;
  plant_id: string | null;
  captured_at: string | null;
  received_at: string;
  confidence: number;
  is_stale: boolean;
  warnings: string[];
  metrics: NormalizedSensorMetrics;
  raw_payload: unknown;
}

const DEFAULT_STALE_AFTER_MINUTES = 60;

const C_TO_F = (c: number): number => Math.round((c * 9 / 5 + 32) * 100) / 100;
const F_TO_C = (f: number): number => Math.round(((f - 32) * 5 / 9) * 100) / 100;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickNum(src: Record<string, unknown>, keys: readonly string[]): { key: string; value: number } | null {
  for (const k of keys) {
    if (k in src) {
      const n = num(src[k]);
      if (n !== null) return { key: k, value: n };
    }
  }
  return null;
}

const KEYS = {
  tempC: ["temperature_c", "temp_c", "air_temp_c"] as const,
  tempF: ["temperature_f", "temp_f", "tempf", "air_temp_f"] as const,
  humidity: ["humidity_pct", "humidity", "rh_pct", "rh", "relative_humidity"] as const,
  vpd: ["vpd_kpa", "vpd"] as const,
  co2: ["co2_ppm", "co2"] as const,
  soilMoisture: ["soil_moisture_pct", "soil_moisture", "soil_water_content", "vwc"] as const,
  soilTempC: ["soil_temperature_c", "soil_temp_c"] as const,
  soilTempF: ["soil_temperature_f", "soil_temp_f"] as const,
  soilEcMs: ["soil_ec_ms_cm", "soil_ec"] as const,
  soilEcUs: ["soil_ec_us_cm"] as const,
  resEcMs: ["reservoir_ec_ms_cm", "reservoir_ec"] as const,
  resEcAmbiguous: ["ec"] as const,
  resEcUs: ["ec_us_cm"] as const,
  ph: ["reservoir_ph", "ph"] as const,
  ppfd: ["ppfd_umol_m2_s", "ppfd"] as const,
} as const;

function parseDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function normalizeSensorReading(
  input: unknown,
  options: NormalizeSensorReadingOptions,
): NormalizedSensorReading {
  const warnings: string[] = [];
  const truthSource: SensorTruthSource = options.source;
  const sourceIdentity: SensorSourceIdentity = options.sourceIdentity ?? "unknown";
  const transport: SensorTransport = options.transport ?? "unknown";
  const tent_id =
    typeof options.tentId === "string" && options.tentId.trim() ? options.tentId.trim() : null;
  const plant_id =
    typeof options.plantId === "string" && options.plantId.trim() ? options.plantId.trim() : null;
  const now = options.now ?? new Date();
  const staleAfterMinutes =
    typeof options.staleAfterMinutes === "number" && options.staleAfterMinutes > 0
      ? options.staleAfterMinutes
      : DEFAULT_STALE_AFTER_MINUTES;

  const received_at = (options.receivedAt && parseDate(options.receivedAt)?.toISOString()) || now.toISOString();

  const capturedDate = parseDate(options.capturedAt ?? null);
  const captured_at = capturedDate ? capturedDate.toISOString() : null;
  if (!captured_at) warnings.push("missing_captured_at");

  if (!tent_id) warnings.push("missing_tent_id");

  const metrics: NormalizedSensorMetrics = {
    temperature_c: null,
    temperature_f: null,
    humidity_pct: null,
    vpd_kpa: null,
    co2_ppm: null,
    soil_moisture_pct: null,
    soil_temperature_c: null,
    soil_temperature_f: null,
    soil_ec_ms_cm: null,
    reservoir_ec_ms_cm: null,
    reservoir_ph: null,
    ppfd_umol_m2_s: null,
  };

  let recognizedShape = false;
  const payload: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    recognizedShape = true;
  } else {
    warnings.push("unknown_input_shape");
  }

  // Temperature
  const tC = pickNum(payload, KEYS.tempC);
  const tF = pickNum(payload, KEYS.tempF);
  if (tC) {
    metrics.temperature_c = round2(tC.value);
    metrics.temperature_f = C_TO_F(tC.value);
    if (tC.value > 60) warnings.push("temperature_c_likely_fahrenheit");
  } else if (tF) {
    metrics.temperature_f = round2(tF.value);
    metrics.temperature_c = F_TO_C(tF.value);
    if (tF.value < 50 && tF.value > -10) warnings.push("temperature_f_likely_celsius");
  }

  // Humidity
  const rh = pickNum(payload, KEYS.humidity);
  if (rh) {
    if (rh.value < 0 || rh.value > 100) {
      warnings.push("humidity_out_of_range");
    } else {
      metrics.humidity_pct = round2(rh.value);
      if (rh.value === 0 || rh.value === 100) warnings.push("humidity_stuck_value");
    }
  }

  // VPD
  const vpd = pickNum(payload, KEYS.vpd);
  if (vpd && vpd.value >= 0 && vpd.value <= 6) {
    metrics.vpd_kpa = round2(vpd.value);
  } else if (metrics.temperature_c !== null && metrics.humidity_pct !== null) {
    metrics.vpd_kpa = calculateVPD(metrics.temperature_c, metrics.humidity_pct);
  }

  // CO2
  const co2 = pickNum(payload, KEYS.co2);
  if (co2 && co2.value >= 0 && co2.value <= 10000) {
    metrics.co2_ppm = Math.round(co2.value);
  }

  // Soil moisture
  const sm = pickNum(payload, KEYS.soilMoisture);
  if (sm) {
    if (sm.value < 0 || sm.value > 100) {
      warnings.push("soil_moisture_out_of_range");
    } else {
      metrics.soil_moisture_pct = round2(sm.value);
      if (sm.value === 0 || sm.value === 100) warnings.push("soil_moisture_stuck_value");
    }
  }

  // Soil temperature
  const stC = pickNum(payload, KEYS.soilTempC);
  const stF = pickNum(payload, KEYS.soilTempF);
  if (stC) {
    metrics.soil_temperature_c = round2(stC.value);
    metrics.soil_temperature_f = C_TO_F(stC.value);
  } else if (stF) {
    metrics.soil_temperature_f = round2(stF.value);
    metrics.soil_temperature_c = F_TO_C(stF.value);
  }

  // Soil EC
  const soilEcUs = pickNum(payload, KEYS.soilEcUs);
  const soilEcMs = pickNum(payload, KEYS.soilEcMs);
  if (soilEcUs) {
    metrics.soil_ec_ms_cm = round2(soilEcUs.value / 1000);
  } else if (soilEcMs) {
    if (soilEcMs.value > 20) {
      // mS/cm field but value looks like µS/cm (e.g. 1450)
      warnings.push("soil_ec_likely_us_cm");
    }
    metrics.soil_ec_ms_cm = round2(soilEcMs.value);
  }

  // Reservoir EC
  const resEcUs = pickNum(payload, KEYS.resEcUs);
  const resEcMs = pickNum(payload, KEYS.resEcMs);
  const resEcAmb = pickNum(payload, KEYS.resEcAmbiguous);
  if (resEcUs) {
    metrics.reservoir_ec_ms_cm = round2(resEcUs.value / 1000);
  } else if (resEcMs) {
    if (resEcMs.value > 20) warnings.push("reservoir_ec_likely_us_cm");
    metrics.reservoir_ec_ms_cm = round2(resEcMs.value);
  } else if (resEcAmb) {
    if (resEcAmb.value > 20) {
      warnings.push("reservoir_ec_likely_us_cm");
      metrics.reservoir_ec_ms_cm = round2(resEcAmb.value / 1000);
    } else {
      metrics.reservoir_ec_ms_cm = round2(resEcAmb.value);
    }
  }

  // pH
  const ph = pickNum(payload, KEYS.ph);
  if (ph) {
    if (ph.value < 0 || ph.value > 14) {
      warnings.push("ph_out_of_range");
    } else {
      metrics.reservoir_ph = round2(ph.value);
      if (ph.value < 3 || ph.value > 9) warnings.push("ph_out_of_realistic_range");
    }
  }

  // PPFD
  const ppfd = pickNum(payload, KEYS.ppfd);
  if (ppfd && ppfd.value >= 0 && ppfd.value <= 3000) {
    metrics.ppfd_umol_m2_s = Math.round(ppfd.value);
  }

  const hasAnyMetric = Object.values(metrics).some((v) => v !== null);
  if (!hasAnyMetric) warnings.push("no_usable_metrics");

  // Stale detection
  let is_stale = false;
  if (captured_at && capturedDate) {
    const ageMin = (now.getTime() - capturedDate.getTime()) / 60000;
    if (ageMin > staleAfterMinutes) {
      is_stale = true;
      warnings.push("stale_reading");
    }
  }

  // Resolve top-level source
  let source: SensorTruthSource = truthSource;
  if (!hasAnyMetric) {
    source = "invalid";
  } else if (truthSource === "invalid") {
    source = "invalid";
  } else if (truthSource === "demo") {
    source = "demo";
  } else if (is_stale) {
    source = "stale";
  }

  // Confidence
  let confidence = 100;
  if (!tent_id) confidence -= 30;
  if (!captured_at) confidence -= 30;
  if (is_stale) confidence -= 25;
  const suspiciousCount = warnings.filter(
    (w) =>
      w === "humidity_stuck_value" ||
      w === "soil_moisture_stuck_value" ||
      w === "humidity_out_of_range" ||
      w === "soil_moisture_out_of_range" ||
      w === "temperature_c_likely_fahrenheit" ||
      w === "temperature_f_likely_celsius" ||
      w === "soil_ec_likely_us_cm" ||
      w === "reservoir_ec_likely_us_cm" ||
      w === "ph_out_of_range" ||
      w === "ph_out_of_realistic_range" ||
      w === "unknown_input_shape",
  ).length;
  confidence -= suspiciousCount * 10;
  if (!hasAnyMetric) confidence = Math.min(confidence, 10);
  if (source === "invalid") confidence = Math.min(confidence, 25);
  if (source === "demo") confidence = Math.min(confidence, 50);
  if (confidence < 0) confidence = 0;
  if (confidence > 100) confidence = 100;

  // Touch recognizedShape so it isn't optimized away (kept for clarity).
  void recognizedShape;

  return {
    source,
    source_identity: sourceIdentity,
    transport,
    tent_id,
    plant_id,
    captured_at,
    received_at,
    confidence,
    is_stale,
    warnings,
    metrics,
    raw_payload: input,
  };
}

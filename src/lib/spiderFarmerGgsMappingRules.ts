/**
 * spiderFarmerGgsMappingRules — pure, read-only normalization of
 * Spider Farmer GGS payloads (delivered via local ESP32/MQTT bridge,
 * Home Assistant, or another local bridge) into a Verdant sensor draft.
 *
 * Hard constraints:
 *  - Pure function. No I/O, no React, no timers, no network.
 *  - Read-only. NEVER emits device commands, setpoints, light/fan
 *    schedules, or anything that could control Spider Farmer hardware.
 *  - Treats MQTT/HA/bridge purely as transport; the Verdant source
 *    label is computed from data quality, never assumed `live`.
 *  - Unknown/missing data is never classified as healthy live.
 *  - Preserves the original payload verbatim under `raw_payload` for
 *    auditability.
 */

export type SpiderFarmerGgsSource = "live" | "stale" | "invalid";
export type SpiderFarmerGgsTransport =
  | "mqtt"
  | "home_assistant"
  | "bridge"
  | "unknown";

export const SPIDER_FARMER_GGS_PROVIDER = "spider_farmer_ggs" as const;

/** 15 minutes — matches the live→stale threshold in sensor truth rules. */
export const SPIDER_FARMER_GGS_STALE_MS = 15 * 60 * 1000;

export type SpiderFarmerGgsReadingKey =
  | "temp_f"
  | "temp_c"
  | "humidity"
  | "vpd_kpa"
  | "ppfd"
  | "co2_ppm"
  | "soil_water_content"
  | "soil_ec"
  | "soil_temp_f"
  | "soil_temp_c"
  | "ph";

export type SpiderFarmerGgsReadings = Partial<
  Record<SpiderFarmerGgsReadingKey, number>
>;

/** Fan/light/schedule state surfaced as CONTEXT ONLY. Never a command. */
export interface SpiderFarmerGgsContext {
  fan_state?: string;
  light_state?: string;
}

export interface SpiderFarmerGgsDraft {
  provider: typeof SPIDER_FARMER_GGS_PROVIDER;
  transport: SpiderFarmerGgsTransport;
  source: SpiderFarmerGgsSource;
  captured_at: string | null;
  tent_id: string | null;
  confidence: number;
  readings: SpiderFarmerGgsReadings;
  context: SpiderFarmerGgsContext;
  raw_payload: unknown;
  warnings: string[];
}

export interface NormalizeOptions {
  /** Injected for deterministic tests. Defaults to new Date(). */
  now?: Date;
  /** Hint when the caller already knows the transport. */
  transportHint?: SpiderFarmerGgsTransport;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickNumber(o: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    if (!(k in o)) continue;
    const raw = o[k];
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickString(o: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function detectTransport(
  raw: Record<string, unknown>,
  hint?: SpiderFarmerGgsTransport,
): SpiderFarmerGgsTransport {
  if (hint) return hint;
  const t = pickString(raw, ["transport", "source_transport", "via"]);
  if (t === "mqtt" || t === "home_assistant" || t === "bridge") return t;
  if (typeof raw.topic === "string") return "mqtt";
  if (typeof raw.entity_id === "string") return "home_assistant";
  return "unknown";
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

function parseCapturedAt(raw: Record<string, unknown>): {
  iso: string | null;
  ms: number | null;
  invalid: boolean;
} {
  const candidate =
    pickString(raw, ["captured_at", "timestamp", "ts", "time"]) ??
    (typeof raw.captured_at === "number" ? String(raw.captured_at) : undefined);
  if (!candidate) return { iso: null, ms: null, invalid: false };
  const numeric = Number(candidate);
  let d: Date;
  if (Number.isFinite(numeric)) {
    // Treat 10-digit as seconds, 13-digit as ms.
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    d = new Date(ms);
  } else {
    d = new Date(candidate);
  }
  if (Number.isNaN(d.getTime())) return { iso: null, ms: null, invalid: true };
  return { iso: d.toISOString(), ms: d.getTime(), invalid: false };
}

const HUMIDITY_KEYS = ["humidity", "rh", "humidity_pct"] as const;
const TEMP_F_KEYS = ["temp_f", "temperature_f", "air_temp_f"] as const;
const TEMP_C_KEYS = ["temp_c", "temperature_c", "air_temp_c"] as const;
const VPD_KEYS = ["vpd_kpa", "vpd"] as const;
const PPFD_KEYS = ["ppfd"] as const;
const CO2_KEYS = ["co2_ppm", "co2"] as const;
const SWC_KEYS = ["soil_water_content", "soil_moisture", "soil_moisture_pct"] as const;
const SOIL_EC_KEYS = ["soil_ec", "soil_ec_mscm"] as const;
const SOIL_TEMP_F_KEYS = ["soil_temp_f"] as const;
const SOIL_TEMP_C_KEYS = ["soil_temp_c"] as const;
const PH_KEYS = ["ph", "reservoir_ph"] as const;

/**
 * Normalize an unknown Spider Farmer GGS payload into a Verdant draft.
 * Output is deterministic for the same input + `now`.
 */
export function normalizeSpiderFarmerGgsPayload(
  input: unknown,
  options: NormalizeOptions = {},
): SpiderFarmerGgsDraft {
  const now = options.now ?? new Date();
  const warnings: string[] = [];
  const readings: SpiderFarmerGgsReadings = {};
  const context: SpiderFarmerGgsContext = {};

  const raw: Record<string, unknown> = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) {
    warnings.push("payload_not_object");
  }

  const transport = detectTransport(raw, options.transportHint);
  const tent_id = pickString(raw, ["tent_id"]) ?? null;

  // unit hint — only convert C→F (or vice-versa) when explicit.
  const unitHint = pickString(raw, ["temp_unit", "unit"])?.toLowerCase();

  // Temperature
  const tF = pickNumber(raw, TEMP_F_KEYS);
  const tC = pickNumber(raw, TEMP_C_KEYS);
  if (tF !== undefined) readings.temp_f = tF;
  if (tC !== undefined) readings.temp_c = tC;
  if (tC !== undefined && tF === undefined && unitHint === "c") {
    readings.temp_f = Math.round(cToF(tC) * 100) / 100;
  }
  if (tF !== undefined && tC === undefined && unitHint === "f") {
    readings.temp_c = Math.round(fToC(tF) * 100) / 100;
  }

  // Humidity
  const rh = pickNumber(raw, HUMIDITY_KEYS);
  if (rh !== undefined) {
    if (rh < 0 || rh > 100) {
      warnings.push("humidity_out_of_range");
    } else {
      readings.humidity = rh;
    }
  }

  // VPD
  const vpd = pickNumber(raw, VPD_KEYS);
  if (vpd !== undefined) {
    if (vpd < 0 || vpd > 10) warnings.push("vpd_implausible");
    else readings.vpd_kpa = vpd;
  }

  // PPFD
  const ppfd = pickNumber(raw, PPFD_KEYS);
  if (ppfd !== undefined) {
    if (ppfd < 0) warnings.push("ppfd_negative");
    else if (ppfd > 2500) warnings.push("ppfd_implausible_high");
    else readings.ppfd = ppfd;
  }

  // CO2
  const co2 = pickNumber(raw, CO2_KEYS);
  if (co2 !== undefined) {
    if (co2 < 0) warnings.push("co2_negative");
    else if (co2 > 10000) warnings.push("co2_implausible_high");
    else readings.co2_ppm = co2;
  }

  // Soil moisture / water content
  const swc = pickNumber(raw, SWC_KEYS);
  if (swc !== undefined) {
    if (swc < 0 || swc > 100) warnings.push("soil_water_content_out_of_range");
    else readings.soil_water_content = swc;
  }

  // Soil EC
  const sec = pickNumber(raw, SOIL_EC_KEYS);
  if (sec !== undefined) {
    if (sec < 0 || sec > 20) warnings.push("soil_ec_implausible");
    else readings.soil_ec = sec;
  }

  // Soil temperature
  const stF = pickNumber(raw, SOIL_TEMP_F_KEYS);
  const stC = pickNumber(raw, SOIL_TEMP_C_KEYS);
  if (stF !== undefined) readings.soil_temp_f = stF;
  if (stC !== undefined) readings.soil_temp_c = stC;
  if (stC !== undefined && stF === undefined && unitHint === "c") {
    readings.soil_temp_f = Math.round(cToF(stC) * 100) / 100;
  }
  if (stF !== undefined && stC === undefined && unitHint === "f") {
    readings.soil_temp_c = Math.round(fToC(stF) * 100) / 100;
  }

  // pH (optional)
  const ph = pickNumber(raw, PH_KEYS);
  if (ph !== undefined) {
    if (ph < 3 || ph > 9) warnings.push("ph_out_of_realistic_range");
    else readings.ph = ph;
  }

  // Context — read-only echoes of equipment state. NEVER a command.
  const fanState = pickString(raw, ["fan_state", "fan"]);
  const lightState = pickString(raw, ["light_state", "light"]);
  if (fanState) context.fan_state = fanState;
  if (lightState) context.light_state = lightState;

  // Timestamp
  const ts = parseCapturedAt(raw);
  if (ts.invalid) warnings.push("captured_at_invalid");

  // Source classification
  let source: SpiderFarmerGgsSource;
  if (!isPlainObject(input)) {
    source = "invalid";
  } else if (ts.invalid) {
    source = "invalid";
  } else if (Object.keys(readings).length === 0) {
    // Unknown / unmappable payload must never be healthy live.
    source = "invalid";
    if (!warnings.includes("no_readings_mapped")) warnings.push("no_readings_mapped");
  } else if (ts.ms === null) {
    // No timestamp at all → cannot prove freshness → degraded, not live.
    source = "stale";
    warnings.push("captured_at_missing");
  } else if (now.getTime() - ts.ms > SPIDER_FARMER_GGS_STALE_MS) {
    source = "stale";
    warnings.push("reading_stale");
  } else if (ts.ms - now.getTime() > 5 * 60 * 1000) {
    source = "invalid";
    warnings.push("captured_at_future");
  } else {
    source = "live";
  }

  // Confidence — conservative, deterministic.
  let confidence = 0;
  if (source === "live") confidence = 0.9 - Math.min(warnings.length, 4) * 0.1;
  else if (source === "stale") confidence = 0.4;
  else confidence = 0;
  confidence = Math.max(0, Math.round(confidence * 100) / 100);

  return {
    provider: SPIDER_FARMER_GGS_PROVIDER,
    transport,
    source,
    captured_at: ts.iso,
    tent_id,
    confidence,
    readings,
    context,
    raw_payload: input,
    warnings,
  };
}

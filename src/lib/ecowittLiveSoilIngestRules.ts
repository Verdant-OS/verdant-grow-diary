/**
 * ecowittLiveSoilIngestRules — pure normalizer + helpers for the local
 * EcoWitt soil/environment MQTT bridge.
 *
 * Hard constraints (Verdant sensor truth):
 *   - No I/O, no Supabase, no React, no timers.
 *   - Never invents data. Never back-fills.
 *   - Invalid / impossible / stuck readings are flagged and NEVER
 *     emitted as healthy `source = "live"` values.
 *   - No device-control fields. Command-shaped keys are ignored.
 *   - No Action Queue writes. No alerts writes. No automation.
 *   - VPD is derived only from valid Celsius air temperature + valid RH.
 *     Missing VPD remains missing — never zero.
 *
 * Output shape is the canonical Verdant `sensor-ingest-webhook` payload:
 *   { tent_id, source: "ecowitt", captured_at, vendor: "ecowitt",
 *     metrics: { temp_f?, humidity_pct?, vpd_kpa?, soil_moisture_pct?,
 *                soil_temp_f?, co2_ppm? },
 *     metadata: { transport: "mqtt", plant_id?, channel?, label? },
 *     raw_payload }
 *
 * Multi-channel soil probes are emitted as one outbound payload PER probe
 * (per channel mapping). This keeps tent/plant routing honest — we never
 * smash two probes into one canonical metric.
 */

import { calculateAirVpdKpa } from "@/lib/vpdRules";
import {
  isAirTempFRealistic,
  isHumidityRealistic,
  isSoilMoistureRealistic,
  isCo2PpmRealistic,
  classifyManualMetric,
} from "@/lib/sensorTruthRules";

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export const ECOWITT_LIVE_SOIL_PROVIDER = "ecowitt" as const;
export const ECOWITT_LIVE_SOIL_SOURCE = "ecowitt" as const;
export const ECOWITT_LIVE_SOIL_TRANSPORT = "mqtt" as const;

/** Stale window for live bridge readings. Anything older than this is invalid. */
export const ECOWITT_LIVE_SOIL_STALE_MS = 15 * 60 * 1000;
/** Future-tolerance for sensor clock skew. */
export const ECOWITT_LIVE_SOIL_FUTURE_MS = 5 * 60 * 1000;

export interface EcowittSoilChannelTarget {
  tent_id: string;
  plant_id?: string | null;
  label?: string | null;
}

/**
 * Channel map: EcoWitt soil key (e.g. `soilmoisture1`) → routing target.
 * If a soil key is not in the map, that probe is skipped (we never invent
 * routing — better to drop than mislabel).
 */
export type EcowittSoilChannelMap = Readonly<Record<string, EcowittSoilChannelTarget>>;

export interface EcowittLiveSoilIngestInput {
  /** Raw JSON object decoded from the MQTT message. */
  payload: Record<string, unknown>;
  /**
   * Fallback tent for the air/environment payload when no channel mapping
   * covers a metric. Optional — if absent the air payload is skipped.
   */
  defaultTentId?: string | null;
  /** Optional fallback plant id (rarely set). */
  defaultPlantId?: string | null;
  /** Channel map for soil probes. */
  soilChannelMap?: EcowittSoilChannelMap;
  /**
   * Optional history cache for stuck-at-bound detection. Keyed by
   * EcoWitt soil key. The normalizer mutates this cache when given.
   */
  recentSoilHistory?: Map<string, number[]>;
  /** Injected clock for deterministic tests. */
  now?: Date;
}

export interface CanonicalWebhookMetrics {
  temp_f?: number;
  humidity_pct?: number;
  vpd_kpa?: number;
  soil_moisture_pct?: number;
  soil_temp_f?: number;
  co2_ppm?: number;
}

export interface CanonicalWebhookPayload {
  tent_id: string;
  source: typeof ECOWITT_LIVE_SOIL_SOURCE;
  captured_at: string;
  vendor: typeof ECOWITT_LIVE_SOIL_PROVIDER;
  metrics: CanonicalWebhookMetrics;
  metadata: {
    transport: typeof ECOWITT_LIVE_SOIL_TRANSPORT;
    plant_id?: string;
    channel?: string;
    label?: string;
    derived_vpd?: true;
  };
  raw_payload: Record<string, unknown>;
}

export type EcowittLiveSoilReason =
  | "malformed_payload"
  | "missing_captured_at"
  | "stale_reading"
  | "future_timestamp"
  | "no_valid_metrics"
  | "no_routing"
  | "invalid_temp"
  | "invalid_rh"
  | "invalid_co2"
  | "invalid_soil_moisture"
  | "invalid_soil_temp"
  | "stuck_soil_moisture";

export interface EcowittLiveSoilIngestResult {
  /** Outbound webhook payloads (one per channel + at most one air payload). */
  payloads: CanonicalWebhookPayload[];
  /** Stable rejection / warning reason codes. */
  reasons: EcowittLiveSoilReason[];
  /** Human chips for redacted dry-run logs. */
  chips: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function parseEcowittDateUtc(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Pick the first finite value from a list of candidate raw keys. */
function pick(payload: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    if (k in payload) {
      const n = toNum(payload[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

/** Resolve air temperature in Fahrenheit, converting Celsius if needed. */
function resolveAirTempF(payload: Record<string, unknown>): number | null {
  const tF = pick(payload, ["tempf", "temp1f", "tempinf"]);
  if (tF !== null) return tF;
  const tC = pick(payload, ["tempc", "temp1c", "tempinc"]);
  if (tC !== null) return cToF(tC);
  return null;
}

/** Resolve soil temperature in Fahrenheit for a given channel suffix. */
function resolveSoilTempF(
  payload: Record<string, unknown>,
  channelIdx: number,
): number | null {
  const f = pick(payload, [`soiltemp${channelIdx}f`]);
  if (f !== null) return f;
  const c = pick(payload, [`soiltemp${channelIdx}c`]);
  if (c !== null) return cToF(c);
  return null;
}

/** Extract integer channel suffix from a key like "soilmoisture12". */
function soilChannelIndex(key: string): number | null {
  const m = /^soilmoisture(\d+)$/i.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Detect "stuck at bound" via the optional recent-history cache. */
function isStuckAtBound(
  history: Map<string, number[]> | undefined,
  key: string,
  value: number,
): boolean {
  if (!history) return false;
  const arr = history.get(key) ?? [];
  arr.push(value);
  while (arr.length > 4) arr.shift();
  history.set(key, arr);
  if (arr.length < 4) return false;
  const allZero = arr.every((v) => v === 0);
  const allHundred = arr.every((v) => v === 100);
  return allZero || allHundred;
}

// ---------------------------------------------------------------------------
// VPD derivation
// ---------------------------------------------------------------------------

export interface DeriveVpdInput {
  /** Air temperature in Celsius (already normalized — NEVER pass display F). */
  airTempC: number | null;
  rhPercent: number | null;
}

/**
 * Derive vpd_kpa for the bridge. Returns null when:
 *   - either temp or RH is missing
 *   - RH is 0 (treated as stuck/invalid)
 *   - RH > 100 (impossible)
 *   - temp is invalid / out of realistic range
 * Never returns 0 as a "missing" sentinel.
 */
export function deriveBridgeVpdKpa(input: DeriveVpdInput): number | null {
  const { airTempC, rhPercent } = input;
  if (airTempC === null || rhPercent === null) return null;
  if (!Number.isFinite(airTempC) || !Number.isFinite(rhPercent)) return null;
  if (rhPercent <= 0) return null;
  if (rhPercent > 100) return null;
  return calculateAirVpdKpa({ tempC: airTempC, rhPercent });
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize a raw EcoWitt MQTT payload into 0..N canonical webhook
 * payloads. Each soil probe with a known channel mapping becomes its own
 * payload. Air/environment metrics use `defaultTentId` when set.
 */
export function normalizeEcowittLiveSoilPayload(
  input: EcowittLiveSoilIngestInput,
): EcowittLiveSoilIngestResult {
  const reasons: EcowittLiveSoilReason[] = [];
  const chips: string[] = [];

  if (!input || typeof input !== "object" || !input.payload || typeof input.payload !== "object") {
    return { payloads: [], reasons: ["malformed_payload"], chips: ["Malformed payload"] };
  }
  const payload = input.payload;
  const now = input.now ?? new Date();

  const capturedAt =
    parseEcowittDateUtc(payload["dateutc"]) ??
    (typeof payload["captured_at"] === "string"
      ? parseEcowittDateUtc(payload["captured_at"])
      : null) ??
    now.toISOString();
  // We always have a captured_at (fallback to injected now). But if dateutc
  // was provided AND unparsable, flag malformed and bail.
  if ("dateutc" in payload && payload["dateutc"] !== null && parseEcowittDateUtc(payload["dateutc"]) === null) {
    return { payloads: [], reasons: ["missing_captured_at"], chips: ["Missing captured_at"] };
  }

  const capturedMs = Date.parse(capturedAt);
  const age = now.getTime() - capturedMs;
  if (age > ECOWITT_LIVE_SOIL_STALE_MS) {
    reasons.push("stale_reading");
    chips.push("Stale reading");
    return { payloads: [], reasons, chips };
  }
  if (age < -ECOWITT_LIVE_SOIL_FUTURE_MS) {
    reasons.push("future_timestamp");
    chips.push("Future timestamp");
    return { payloads: [], reasons, chips };
  }

  // ---- Air/environment ----
  const airTempF = resolveAirTempF(payload);
  let validTempF: number | null = null;
  if (airTempF !== null) {
    if (isAirTempFRealistic(airTempF)) validTempF = airTempF;
    else {
      reasons.push("invalid_temp");
      chips.push("Invalid temp");
    }
  }

  const rh = pick(payload, ["humidity", "humidity1", "humidityin"]);
  let validRh: number | null = null;
  if (rh !== null) {
    if (isHumidityRealistic(rh) && rh > 0) validRh = rh;
    else {
      reasons.push("invalid_rh");
      chips.push("Invalid humidity");
    }
  }

  const vpdKpa = deriveBridgeVpdKpa({
    airTempC: validTempF !== null ? fToC(validTempF) : null,
    rhPercent: validRh,
  });

  const co2Raw = pick(payload, ["co2", "co2in", "co2_in", "co2_ppm"]);
  let validCo2: number | null = null;
  if (co2Raw !== null) {
    if (isCo2PpmRealistic(co2Raw)) validCo2 = co2Raw;
    else {
      reasons.push("invalid_co2");
      chips.push("Invalid CO₂");
    }
  }

  const payloads: CanonicalWebhookPayload[] = [];
  const capturedIso = new Date(capturedMs).toISOString();
  const sharedRaw = redactRawPayloadForOutbound(payload);

  const airMetrics: CanonicalWebhookMetrics = {};
  if (validTempF !== null) airMetrics.temp_f = round2(validTempF);
  if (validRh !== null) airMetrics.humidity_pct = round2(validRh);
  if (vpdKpa !== null) airMetrics.vpd_kpa = vpdKpa;
  if (validCo2 !== null) airMetrics.co2_ppm = round2(validCo2);

  if (Object.keys(airMetrics).length > 0) {
    if (input.defaultTentId) {
      payloads.push({
        tent_id: input.defaultTentId,
        source: ECOWITT_LIVE_SOIL_SOURCE,
        captured_at: capturedIso,
        vendor: ECOWITT_LIVE_SOIL_PROVIDER,
        metrics: airMetrics,
        metadata: {
          transport: ECOWITT_LIVE_SOIL_TRANSPORT,
          ...(input.defaultPlantId ? { plant_id: input.defaultPlantId } : {}),
          ...(vpdKpa !== null ? { derived_vpd: true as const } : {}),
        },
        raw_payload: sharedRaw,
      });
    } else {
      reasons.push("no_routing");
      chips.push("No tent routing for air metrics");
    }
  }

  // ---- Soil probes (multi-channel) ----
  const soilKeys = Object.keys(payload).filter((k) => /^soilmoisture\d+$/i.test(k));
  for (const key of soilKeys) {
    const idx = soilChannelIndex(key);
    if (idx === null) continue;
    const target =
      input.soilChannelMap?.[key] ??
      input.soilChannelMap?.[key.toLowerCase()];

    const raw = toNum(payload[key]);
    if (raw === null) continue;

    let validSoil: number | null = null;
    if (!isSoilMoistureRealistic(raw)) {
      reasons.push("invalid_soil_moisture");
      chips.push(`Invalid soil moisture (${key})`);
    } else if (isStuckAtBound(input.recentSoilHistory, key, raw)) {
      reasons.push("stuck_soil_moisture");
      chips.push(`Stuck soil moisture (${key})`);
    } else {
      validSoil = raw;
    }

    let validSoilTempF: number | null = null;
    const soilTempF = resolveSoilTempF(payload, idx);
    if (soilTempF !== null) {
      const truth = classifyManualMetric("soil_temp_c", fToC(soilTempF));
      if (truth.valid) validSoilTempF = soilTempF;
      else {
        reasons.push("invalid_soil_temp");
        chips.push(`Invalid soil temp (ch${idx})`);
      }
    }

    if (validSoil === null && validSoilTempF === null) continue;
    if (!target) {
      reasons.push("no_routing");
      chips.push(`No channel mapping for ${key}`);
      continue;
    }

    const metrics: CanonicalWebhookMetrics = {};
    if (validSoil !== null) metrics.soil_moisture_pct = round2(validSoil);
    if (validSoilTempF !== null) metrics.soil_temp_f = round2(validSoilTempF);

    payloads.push({
      tent_id: target.tent_id,
      source: ECOWITT_LIVE_SOIL_SOURCE,
      captured_at: capturedIso,
      vendor: ECOWITT_LIVE_SOIL_PROVIDER,
      metrics,
      metadata: {
        transport: ECOWITT_LIVE_SOIL_TRANSPORT,
        ...(target.plant_id ? { plant_id: target.plant_id } : {}),
        channel: key,
        ...(target.label ? { label: target.label } : {}),
      },
      raw_payload: sharedRaw,
    });
  }

  if (payloads.length === 0 && !reasons.includes("stale_reading")) {
    if (!reasons.includes("no_routing") && !reasons.includes("invalid_soil_moisture")) {
      reasons.push("no_valid_metrics");
      chips.push("No valid metrics");
    }
  }

  return { payloads, reasons, chips };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Channel map env parsing
// ---------------------------------------------------------------------------

/**
 * Parse the `ECOWITT_SOIL_CHANNEL_MAP_JSON` env var into a typed channel
 * map. Invalid / non-object input returns an empty map (never throws).
 */
export function parseEcowittSoilChannelMap(raw: unknown): EcowittSoilChannelMap {
  if (typeof raw !== "string" || !raw.trim()) return Object.freeze({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Object.freeze({});
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Object.freeze({});
  }
  const out: Record<string, EcowittSoilChannelTarget> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^soilmoisture\d+$/i.test(k)) continue;
    if (!v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    if (typeof t.tent_id !== "string" || !t.tent_id) continue;
    out[k] = {
      tent_id: t.tent_id,
      plant_id: typeof t.plant_id === "string" ? t.plant_id : null,
      label: typeof t.label === "string" ? t.label : null,
    };
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERN =
  /(passkey|mac|stationtype|password|token|secret|api[_-]?key|auth|bearer|serial)/i;
const PRIVATE_IP_PATTERN =
  /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g;

/** Redact a raw EcoWitt payload for safe outbound forwarding (raw_payload). */
export function redactRawPayloadForOutbound(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string") {
      out[k] = v.replace(PRIVATE_IP_PATTERN, "[redacted-ip]");
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Redact a value for safe log output (no secrets, no IPs). */
export function redactForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.replace(PRIVATE_IP_PATTERN, "[redacted-ip]");
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactForLog);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = redactForLog(v);
    }
  }
  return out;
}

/** Mask a bridge token for safe logging (keeps short prefix). */
export function maskBridgeToken(token: string | null | undefined): string {
  if (!token || typeof token !== "string") return "[missing]";
  if (token.length <= 6) return "[redacted]";
  return `${token.slice(0, 4)}…[redacted]`;
}

// ---------------------------------------------------------------------------
// Retry / backoff (pure scheduler)
// ---------------------------------------------------------------------------

/**
 * Full-Jitter exponential backoff delay (AWS Architecture blog).
 *   delay = random(0, min(cap, base * 2^attempt))
 * Pure and deterministic when `random` is injected.
 */
export function fullJitterBackoffMs(
  attempt: number,
  opts?: { baseMs?: number; capMs?: number; random?: () => number },
): number {
  const base = opts?.baseMs ?? 500;
  const cap = opts?.capMs ?? 15_000;
  const rand = opts?.random ?? Math.random;
  const safeAttempt = Math.max(0, Math.min(10, Math.floor(attempt)));
  const upper = Math.min(cap, base * 2 ** safeAttempt);
  return Math.floor(rand() * upper);
}

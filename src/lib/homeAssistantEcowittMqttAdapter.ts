/**
 * homeAssistantEcowittMqttAdapter — pure adapter for consuming EcoWitt
 * entities that Home Assistant publishes over MQTT (selective JSON or
 * Statestream), plus a passthrough for the legacy ecowitt2mqtt raw path.
 *
 * Hard constraints (Verdant sensor truth + adapter safety):
 *   - No I/O. No Supabase. No React. No timers. No fetch. No MQTT client.
 *   - Never invents data. Never smooths or back-fills.
 *   - Never treats a bridge name as a canonical `source`. Only
 *     `live | stale | invalid` is emitted at that field; provenance
 *     (bridge, transport, upstream_mode, topic, retained) rides in a
 *     dedicated envelope object, never in the source label.
 *   - No device control fields are accepted. Non-sensor / control-shaped
 *     entities (switch., light., fan., humidifier., climate., cover.,
 *     media_player., automation., script., button., etc.) are dropped
 *     with a reason code — they cannot round-trip into the app.
 *   - No mqtt.publish. No HA service calls. No direct DB writes.
 *   - VPD is derived ONLY through the existing Verdant Tetens
 *     implementation in `calculateAirVpdKpa`. HA-precomputed VPD is
 *     treated as unverified metadata unless it passes the same realism
 *     checks as a fresh derivation from same-tent, time-aligned temp+RH.
 *
 * This module is a normalizer. The caller (the existing MQTT runner)
 * decides whether to POST the resulting draft to the validated
 * `sensor-ingest-webhook` Edge Function, and only when explicit live
 * mode + bridge token are configured.
 */

import {
  isAirTempFRealistic,
  isHumidityRealistic,
  isSoilMoistureRealistic,
  isCo2PpmRealistic,
  classifyManualMetric,
} from "@/lib/sensorTruthRules";
import {
  calculateAirVpdKpa,
  fahrenheitToCelsius,
} from "@/lib/vpdRules";
import {
  ECOWITT_MQTT_STALE_MS,
  ECOWITT_MQTT_FUTURE_TOLERANCE_MS,
  normalizeEcowittMqttPayload,
  type EcowittMqttPayload,
  type EcowittMqttIngestResult,
} from "@/lib/ecowittMqttIngestRules";

// ---------------------------------------------------------------------------
// Provenance vocabulary
// ---------------------------------------------------------------------------

export type HaSensorSource = "live" | "stale" | "invalid";
export const HA_PROVIDER = "ecowitt" as const;
export const HA_TRANSPORT = "mqtt" as const;

export type HaBridge = "home_assistant" | "ecowitt2mqtt";
export type HaUpstreamMode =
  | "ha_core_ecowitt_push"
  | "ha_ecowitt_iot_poll"
  | "ecowitt_custom_upload"
  | "unknown";

export type HaAdapterMode = "ecowitt_raw" | "ha_json" | "ha_statestream";

export type HaCanonicalMetric =
  | "air_temp_f"
  | "humidity_pct"
  | "soil_moisture_pct"
  | "soil_temp_f"
  | "co2_ppm"
  | "vpd_kpa";

/** VPD pairing window: same-tent temp + RH must land within this window. */
export const HA_VPD_PAIRING_WINDOW_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Reason codes
// ---------------------------------------------------------------------------

export type HaAdapterReason =
  | "malformed_payload"
  | "missing_captured_at"
  | "invalid_captured_at"
  | "future_timestamp"
  | "stale_reading"
  | "retained_without_source_timestamp"
  | "unknown_entity"
  | "control_shaped_entity_dropped"
  | "unknown_or_unavailable_state"
  | "unit_mismatch"
  | "invalid_metric_value"
  | "no_valid_metrics"
  | "vpd_pairing_window_missed"
  | "vpd_different_tent"
  | "vpd_inputs_invalid";

// ---------------------------------------------------------------------------
// Mapping file
// ---------------------------------------------------------------------------

export interface HaEntityMapping {
  /** Home Assistant entity id, e.g. `sensor.ecowitt_gw1200_outdoor_temperature`. */
  entity_id: string;
  metric: HaCanonicalMetric;
  /** Expected unit as reported by HA; used only for a soft mismatch reason. */
  expected_unit?: "°F" | "°C" | "%" | "ppm" | "kPa";
  tent_id: string;
  plant_id?: string | null;
  channel?: string | null;
}

export interface HaMqttMappingFile {
  version: 1;
  bridge: HaBridge;
  upstream_mode: HaUpstreamMode;
  /**
   * MQTT Statestream root, e.g. `homeassistant`. Only used when
   * consuming statestream topics. Never inferred from the topic itself.
   */
  statestream_topic_prefix?: string;
  entities: readonly HaEntityMapping[];
}

// ---------------------------------------------------------------------------
// Adapter I/O shapes
// ---------------------------------------------------------------------------

export interface HaProvenanceEnvelope {
  source: HaSensorSource;
  provider: typeof HA_PROVIDER;
  transport: typeof HA_TRANSPORT;
  bridge: HaBridge;
  upstream_mode: HaUpstreamMode;
  topic: string;
  retained: boolean;
  captured_at: string | null;
  received_at: string | null;
  broker_received_at: string | null;
  tent_id: string | null;
  plant_id: string | null;
  confidence: number;
  reason_codes: HaAdapterReason[];
  /** Redacted-key-safe echo of raw input. Value redaction happens at report time. */
  raw_payload: unknown;
}

export interface HaMetricReading {
  metric: HaCanonicalMetric;
  value: number;
  tent_id: string;
  plant_id: string | null;
  captured_at: string; // ISO
  provenance: HaProvenanceEnvelope;
  idempotency_key: string;
}

export interface HaAdapterResult {
  ok: boolean;
  readings: HaMetricReading[];
  provenance: HaProvenanceEnvelope;
  reasons: HaAdapterReason[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTROL_DOMAINS = new Set([
  "switch",
  "light",
  "fan",
  "humidifier",
  "climate",
  "cover",
  "media_player",
  "automation",
  "script",
  "button",
  "input_boolean",
  "input_button",
  "lock",
  "vacuum",
  "siren",
  "valve",
  "water_heater",
  "notify",
  "remote",
  "select",
  "input_select",
]);

function entityDomain(entityId: string): string | null {
  const i = entityId.indexOf(".");
  return i > 0 ? entityId.slice(0, i) : null;
}

function isControlShaped(entityId: string): boolean {
  const d = entityDomain(entityId);
  return !!d && CONTROL_DOMAINS.has(d);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // Handle JSON-serialized numeric state ("72.4", "\"72.4\"").
    const stripped = s.replace(/^"(.*)"$/, "$1");
    if (/^(unknown|unavailable|none|null|nan|-)$/i.test(stripped)) return null;
    const n = Number(stripped);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeUnit(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim().toLowerCase();
  if (!s) return null;
  if (s === "°f" || s === "f" || s === "degf") return "°F";
  if (s === "°c" || s === "c" || s === "degc") return "°C";
  if (s === "%" || s === "pct" || s === "percent") return "%";
  if (s === "ppm") return "ppm";
  if (s === "kpa") return "kPa";
  return s;
}

/**
 * Convert a value to Fahrenheit given the reported unit. If the unit is
 * ambiguous we do NOT guess — return null and let the caller drop it.
 */
function toFahrenheit(value: number, unit: string | null): number | null {
  if (unit === "°F") return value;
  if (unit === "°C") return value * 9 / 5 + 32;
  return null;
}

function isFinitePositiveWindow(ms: unknown): ms is number {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0;
}

/** SHA-free deterministic idempotency string. Stable across identical inputs. */
export function buildHaIdempotencyKey(args: {
  bridge: HaBridge;
  upstream_mode: HaUpstreamMode;
  tent_id: string;
  metric: HaCanonicalMetric;
  captured_at: string;
  value: number;
}): string {
  // Normalize value to 3 decimals so trivially different string forms of
  // the same number collapse (e.g. 72.4000 vs 72.4). Values that survive
  // sensor-truth validation are always finite.
  const v = Math.round(args.value * 1000) / 1000;
  return [
    "ha",
    args.bridge,
    args.upstream_mode,
    args.tent_id,
    args.metric,
    args.captured_at,
    v.toString(),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Metric validation
// ---------------------------------------------------------------------------

function validateAndCoerce(
  metric: HaCanonicalMetric,
  rawValue: number,
  unit: string | null,
): { ok: true; value: number } | { ok: false; reason: HaAdapterReason } {
  switch (metric) {
    case "air_temp_f":
    case "soil_temp_f": {
      const f = toFahrenheit(rawValue, unit ?? "°F");
      if (f === null) return { ok: false, reason: "unit_mismatch" };
      if (metric === "air_temp_f") {
        if (!isAirTempFRealistic(f)) return { ok: false, reason: "invalid_metric_value" };
      } else {
        const truth = classifyManualMetric("soil_temp_c", fahrenheitToCelsius(f));
        if (!truth.valid) return { ok: false, reason: "invalid_metric_value" };
      }
      return { ok: true, value: Math.round(f * 100) / 100 };
    }
    case "humidity_pct": {
      if (unit && unit !== "%") return { ok: false, reason: "unit_mismatch" };
      if (!isHumidityRealistic(rawValue)) return { ok: false, reason: "invalid_metric_value" };
      return { ok: true, value: rawValue };
    }
    case "soil_moisture_pct": {
      if (unit && unit !== "%") return { ok: false, reason: "unit_mismatch" };
      if (!isSoilMoistureRealistic(rawValue)) return { ok: false, reason: "invalid_metric_value" };
      return { ok: true, value: rawValue };
    }
    case "co2_ppm": {
      if (unit && unit !== "ppm") return { ok: false, reason: "unit_mismatch" };
      if (!isCo2PpmRealistic(rawValue)) return { ok: false, reason: "invalid_metric_value" };
      return { ok: true, value: rawValue };
    }
    case "vpd_kpa": {
      // HA-precomputed VPD is never authoritative here. It is dropped
      // and re-derived (or not) by deriveVpdIfPaired.
      return { ok: false, reason: "invalid_metric_value" };
    }
  }
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

interface FreshnessOutcome {
  source: HaSensorSource;
  reasons: HaAdapterReason[];
  capturedAt: string | null;
}

function classifyFreshness(args: {
  capturedAtRaw: string | null;
  retained: boolean;
  now: Date;
}): FreshnessOutcome {
  const { capturedAtRaw, retained, now } = args;
  if (!capturedAtRaw) {
    return {
      source: "invalid",
      reasons: retained
        ? ["retained_without_source_timestamp"]
        : ["missing_captured_at"],
      capturedAt: null,
    };
  }
  const ms = Date.parse(capturedAtRaw);
  if (!Number.isFinite(ms)) {
    return {
      source: "invalid",
      reasons: ["invalid_captured_at"],
      capturedAt: null,
    };
  }
  const iso = new Date(ms).toISOString();
  const ageMs = now.getTime() - ms;
  if (ageMs < -ECOWITT_MQTT_FUTURE_TOLERANCE_MS) {
    return { source: "invalid", reasons: ["future_timestamp"], capturedAt: iso };
  }
  if (ageMs > ECOWITT_MQTT_STALE_MS) {
    return { source: "stale", reasons: ["stale_reading"], capturedAt: iso };
  }
  return { source: "live", reasons: [], capturedAt: iso };
}

// ---------------------------------------------------------------------------
// HA JSON envelope
// ---------------------------------------------------------------------------

/**
 * Minimal HA "selective JSON" envelope. Verdant expects the HA side to
 * publish one message per entity containing at least entity_id, state,
 * and a source timestamp (last_updated).
 */
export interface HaJsonEnvelope {
  entity_id?: unknown;
  state?: unknown;
  unit_of_measurement?: unknown;
  last_updated?: unknown;
  last_changed?: unknown;
  device_class?: unknown;
  attributes?: Record<string, unknown>;
}

export interface ParseHaJsonArgs {
  topic: string;
  payload: unknown;
  mapping: HaMqttMappingFile;
  receivedAt: Date;
  retained: boolean;
  brokerReceivedAt?: Date | null;
  now?: Date;
}

export function parseHaJsonMessage(args: ParseHaJsonArgs): HaAdapterResult {
  const now = args.now ?? new Date();
  const provenanceBase = baseProvenance({
    mapping: args.mapping,
    topic: args.topic,
    retained: args.retained,
    receivedAt: args.receivedAt,
    brokerReceivedAt: args.brokerReceivedAt ?? null,
    raw: args.payload,
  });

  if (
    !args.payload ||
    typeof args.payload !== "object" ||
    Array.isArray(args.payload)
  ) {
    return rejectResult(provenanceBase, ["malformed_payload"]);
  }
  const env = args.payload as HaJsonEnvelope;
  const entityId = typeof env.entity_id === "string" ? env.entity_id : null;
  if (!entityId) return rejectResult(provenanceBase, ["malformed_payload"]);

  if (isControlShaped(entityId)) {
    return rejectResult(provenanceBase, ["control_shaped_entity_dropped"]);
  }
  const mapEntry = args.mapping.entities.find((e) => e.entity_id === entityId);
  if (!mapEntry) return rejectResult(provenanceBase, ["unknown_entity"]);

  const rawState = env.state;
  const stateNum = toNumber(rawState);
  if (stateNum === null) {
    return rejectResult(provenanceBase, ["unknown_or_unavailable_state"]);
  }

  const unit = normalizeUnit(env.unit_of_measurement);
  const validated = validateAndCoerce(mapEntry.metric, stateNum, unit);
  if ("reason" in validated) return rejectResult(provenanceBase, [validated.reason]);

  const capturedAtRaw =
    typeof env.last_updated === "string"
      ? env.last_updated
      : typeof env.last_changed === "string"
        ? env.last_changed
        : null;
  const fresh = classifyFreshness({
    capturedAtRaw,
    retained: args.retained,
    now,
  });
  if (fresh.source === "invalid") return rejectResult(provenanceBase, fresh.reasons);

  return buildReadingResult({
    provenanceBase,
    mapEntry,
    freshness: fresh,
    value: validated.value,
  });
}

// ---------------------------------------------------------------------------
// HA Statestream assembly
// ---------------------------------------------------------------------------

/**
 * HA MQTT Statestream publishes each entity at
 *   <prefix>/<domain>/<object_id>/state
 *   <prefix>/<domain>/<object_id>/attributes  (JSON blob)
 *   optionally per-attribute topics
 *
 * We accumulate state + attributes per-entity so a message pair can
 * assemble into one deterministic reading. Callers own the buffer's
 * lifetime; nothing is timer-driven inside this module.
 */
export interface StatestreamPart {
  topic: string;
  payload: unknown; // string or already-parsed JSON
  retained: boolean;
  receivedAt: Date;
}

export interface StatestreamAssembledMessage {
  entity_id: string;
  state: unknown;
  attributes: Record<string, unknown>;
  retained: boolean;
  receivedAt: Date;
}

interface StatestreamBuffer {
  entity_id: string;
  state?: unknown;
  attributes?: Record<string, unknown>;
  retained: boolean;
  receivedAt: Date;
}

export class HaStatestreamAssembler {
  private readonly prefix: string;
  private readonly buffers = new Map<string, StatestreamBuffer>();

  constructor(prefix: string) {
    if (!prefix || typeof prefix !== "string") {
      throw new Error("HaStatestreamAssembler requires a non-empty prefix");
    }
    this.prefix = prefix.replace(/\/+$/, "");
  }

  /** Assemble deterministically; returns a message when state is present. */
  consume(part: StatestreamPart): StatestreamAssembledMessage | null {
    const parsed = this.parseTopic(part.topic);
    if (!parsed) return null;
    const { entity_id, kind } = parsed;
    const buf: StatestreamBuffer = this.buffers.get(entity_id) ?? {
      entity_id,
      retained: part.retained,
      receivedAt: part.receivedAt,
    };
    // Track most-recent metadata but do not silently overwrite retained
    // status to false if a live update replaces a retained one.
    buf.retained = part.retained;
    buf.receivedAt = part.receivedAt;

    if (kind === "state") {
      buf.state = this.decodeStatePayload(part.payload);
    } else if (kind === "attributes") {
      const attrs = this.decodeAttributesPayload(part.payload);
      buf.attributes = attrs ?? buf.attributes ?? {};
    }
    this.buffers.set(entity_id, buf);

    if (buf.state === undefined) return null;
    return {
      entity_id,
      state: buf.state,
      attributes: buf.attributes ?? {},
      retained: buf.retained,
      receivedAt: buf.receivedAt,
    };
  }

  private parseTopic(
    topic: string,
  ): { entity_id: string; kind: "state" | "attributes" | "other" } | null {
    if (!topic.startsWith(this.prefix + "/")) return null;
    const rest = topic.slice(this.prefix.length + 1).split("/");
    if (rest.length < 3) return null;
    const [domain, object_id, leaf] = rest;
    if (!domain || !object_id || !leaf) return null;
    const entity_id = `${domain}.${object_id}`;
    if (leaf === "state") return { entity_id, kind: "state" };
    if (leaf === "attributes") return { entity_id, kind: "attributes" };
    return { entity_id, kind: "other" };
  }

  private decodeStatePayload(payload: unknown): unknown {
    if (typeof payload === "string") {
      const s = payload.trim();
      if (!s) return null;
      // Try JSON first for `"72.4"` style; fall back to raw string.
      try {
        return JSON.parse(s) as unknown;
      } catch {
        return s;
      }
    }
    return payload;
  }

  private decodeAttributesPayload(
    payload: unknown,
  ): Record<string, unknown> | null {
    if (typeof payload === "string") {
      try {
        const p = JSON.parse(payload) as unknown;
        if (p && typeof p === "object" && !Array.isArray(p)) {
          return p as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
    return null;
  }
}

export interface ParseStatestreamArgs {
  assembled: StatestreamAssembledMessage;
  mapping: HaMqttMappingFile;
  brokerReceivedAt?: Date | null;
  now?: Date;
}

export function parseHaStatestreamMessage(
  args: ParseStatestreamArgs,
): HaAdapterResult {
  const now = args.now ?? new Date();
  const { assembled } = args;
  const topic = synthTopic(args.mapping.statestream_topic_prefix ?? "", assembled.entity_id);
  const provenanceBase = baseProvenance({
    mapping: args.mapping,
    topic,
    retained: assembled.retained,
    receivedAt: assembled.receivedAt,
    brokerReceivedAt: args.brokerReceivedAt ?? null,
    raw: { entity_id: assembled.entity_id, state: assembled.state, attributes: assembled.attributes },
  });

  if (isControlShaped(assembled.entity_id)) {
    return rejectResult(provenanceBase, ["control_shaped_entity_dropped"]);
  }
  const mapEntry = args.mapping.entities.find(
    (e) => e.entity_id === assembled.entity_id,
  );
  if (!mapEntry) return rejectResult(provenanceBase, ["unknown_entity"]);

  const stateNum = toNumber(assembled.state);
  if (stateNum === null) {
    return rejectResult(provenanceBase, ["unknown_or_unavailable_state"]);
  }

  const unit = normalizeUnit(
    (assembled.attributes as Record<string, unknown>).unit_of_measurement,
  );
  const validated = validateAndCoerce(mapEntry.metric, stateNum, unit);
  if ("reason" in validated) return rejectResult(provenanceBase, [validated.reason]);

  const capturedAtRaw =
    typeof assembled.attributes.last_updated === "string"
      ? (assembled.attributes.last_updated as string)
      : typeof assembled.attributes.last_changed === "string"
        ? (assembled.attributes.last_changed as string)
        : null;
  const fresh = classifyFreshness({
    capturedAtRaw,
    retained: assembled.retained,
    now,
  });
  if (fresh.source === "invalid") return rejectResult(provenanceBase, fresh.reasons);

  return buildReadingResult({
    provenanceBase,
    mapEntry,
    freshness: fresh,
    value: validated.value,
  });
}

function synthTopic(prefix: string, entityId: string): string {
  const clean = prefix.replace(/\/+$/, "");
  return clean
    ? `${clean}/${entityId.replace(".", "/")}/state`
    : `${entityId.replace(".", "/")}/state`;
}

// ---------------------------------------------------------------------------
// ecowitt_raw passthrough
// ---------------------------------------------------------------------------

export interface ParseEcowittRawArgs {
  topic: string;
  payload: EcowittMqttPayload;
  mapping: HaMqttMappingFile;
  receivedAt: Date;
  retained: boolean;
  brokerReceivedAt?: Date | null;
  now?: Date;
}

/**
 * Wraps the existing `normalizeEcowittMqttPayload` output in the
 * provenance envelope so downstream tooling gets one uniform shape.
 * Behavior of the underlying normalizer is unchanged.
 */
export function parseEcowittRawMessage(
  args: ParseEcowittRawArgs,
): { adapter: HaAdapterResult; legacy: EcowittMqttIngestResult } {
  const legacy = normalizeEcowittMqttPayload({
    payload: args.payload,
    tentId: firstTentIdFromMapping(args.mapping),
    now: args.now,
  });
  const base = baseProvenance({
    mapping: args.mapping,
    topic: args.topic,
    retained: args.retained,
    receivedAt: args.receivedAt,
    brokerReceivedAt: args.brokerReceivedAt ?? null,
    raw: args.payload,
    forcedBridge: "ecowitt2mqtt",
  });

  if (!legacy.ok || !legacy.draft) {
    return {
      legacy,
      adapter: rejectResult(base, legacyReasonsToAdapterReasons(legacy.reasons)),
    };
  }
  const d = legacy.draft;
  const now = args.now ?? new Date();
  const fresh = classifyFreshness({
    capturedAtRaw: d.captured_at,
    retained: args.retained,
    now,
  });
  const provenance: HaProvenanceEnvelope = {
    ...base,
    source: fresh.source,
    captured_at: fresh.capturedAt,
    tent_id: d.tent_id,
    plant_id: d.plant_id,
    confidence: d.confidence,
    reason_codes: [
      ...base.reason_codes,
      ...fresh.reasons,
      ...legacyReasonsToAdapterReasons(legacy.reasons),
    ],
  };
  const readings: HaMetricReading[] = [];
  const perMetric: Array<{ metric: HaCanonicalMetric; value: number | null }> = [
    { metric: "air_temp_f", value: d.air_temp_f },
    { metric: "humidity_pct", value: d.humidity_pct },
    { metric: "soil_moisture_pct", value: d.soil_water_content_pct },
    { metric: "soil_temp_f", value: d.soil_temp_f },
    { metric: "co2_ppm", value: d.co2_ppm },
    { metric: "vpd_kpa", value: d.vpd_kpa },
  ];
  if (fresh.source === "live" && d.tent_id) {
    for (const { metric, value } of perMetric) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      readings.push({
        metric,
        value,
        tent_id: d.tent_id,
        plant_id: d.plant_id,
        captured_at: fresh.capturedAt!,
        provenance,
        idempotency_key: buildHaIdempotencyKey({
          bridge: provenance.bridge,
          upstream_mode: provenance.upstream_mode,
          tent_id: d.tent_id,
          metric,
          captured_at: fresh.capturedAt!,
          value,
        }),
      });
    }
  }
  return {
    legacy,
    adapter: {
      ok: readings.length > 0,
      readings,
      provenance,
      reasons: provenance.reason_codes,
    },
  };
}

function firstTentIdFromMapping(m: HaMqttMappingFile): string | null {
  return m.entities[0]?.tent_id ?? null;
}

function legacyReasonsToAdapterReasons(
  reasons: readonly string[],
): HaAdapterReason[] {
  const out: HaAdapterReason[] = [];
  for (const r of reasons) {
    if (r === "stale_reading") out.push("stale_reading");
    else if (r === "missing_captured_at") out.push("missing_captured_at");
    else if (r === "malformed_payload") out.push("malformed_payload");
    else out.push("invalid_metric_value");
  }
  return out;
}

// ---------------------------------------------------------------------------
// VPD pairing across two readings (temp + RH)
// ---------------------------------------------------------------------------

export interface VpdPairingArgs {
  temp: HaMetricReading | null;
  rh: HaMetricReading | null;
  pairingWindowMs?: number;
  now?: Date;
}

export function deriveVpdIfPaired(
  args: VpdPairingArgs,
): HaMetricReading | { ok: false; reason: HaAdapterReason } {
  const window = isFinitePositiveWindow(args.pairingWindowMs)
    ? args.pairingWindowMs
    : HA_VPD_PAIRING_WINDOW_MS;
  const { temp, rh } = args;
  if (!temp || !rh) return { ok: false, reason: "vpd_inputs_invalid" };
  if (temp.metric !== "air_temp_f" || rh.metric !== "humidity_pct") {
    return { ok: false, reason: "vpd_inputs_invalid" };
  }
  if (temp.tent_id !== rh.tent_id) return { ok: false, reason: "vpd_different_tent" };
  if (temp.provenance.source !== "live" || rh.provenance.source !== "live") {
    return { ok: false, reason: "vpd_inputs_invalid" };
  }
  const tt = Date.parse(temp.captured_at);
  const rt = Date.parse(rh.captured_at);
  if (!Number.isFinite(tt) || !Number.isFinite(rt)) {
    return { ok: false, reason: "vpd_inputs_invalid" };
  }
  if (Math.abs(tt - rt) > window) {
    return { ok: false, reason: "vpd_pairing_window_missed" };
  }
  const vpd = calculateAirVpdKpa({ tempF: temp.value, rhPercent: rh.value });
  if (vpd === null) return { ok: false, reason: "vpd_inputs_invalid" };

  // Use the later of the two timestamps as the derived captured_at, so
  // the result never predates its inputs.
  const captured_at = new Date(Math.max(tt, rt)).toISOString();
  const provenance: HaProvenanceEnvelope = {
    ...temp.provenance,
    reason_codes: [...temp.provenance.reason_codes, ...rh.provenance.reason_codes],
    captured_at,
  };
  return {
    metric: "vpd_kpa",
    value: vpd,
    tent_id: temp.tent_id,
    plant_id: temp.plant_id ?? rh.plant_id ?? null,
    captured_at,
    provenance,
    idempotency_key: buildHaIdempotencyKey({
      bridge: provenance.bridge,
      upstream_mode: provenance.upstream_mode,
      tent_id: temp.tent_id,
      metric: "vpd_kpa",
      captured_at,
      value: vpd,
    }),
  };
}

// ---------------------------------------------------------------------------
// Envelope builders
// ---------------------------------------------------------------------------

function baseProvenance(args: {
  mapping: HaMqttMappingFile;
  topic: string;
  retained: boolean;
  receivedAt: Date;
  brokerReceivedAt: Date | null;
  raw: unknown;
  forcedBridge?: HaBridge;
}): HaProvenanceEnvelope {
  return {
    source: "invalid",
    provider: HA_PROVIDER,
    transport: HA_TRANSPORT,
    bridge: args.forcedBridge ?? args.mapping.bridge,
    upstream_mode: args.mapping.upstream_mode,
    topic: args.topic,
    retained: args.retained,
    captured_at: null,
    received_at: args.receivedAt.toISOString(),
    broker_received_at: args.brokerReceivedAt
      ? args.brokerReceivedAt.toISOString()
      : null,
    tent_id: null,
    plant_id: null,
    confidence: 0,
    reason_codes: [],
    raw_payload: args.raw,
  };
}

function rejectResult(
  base: HaProvenanceEnvelope,
  reasons: HaAdapterReason[],
): HaAdapterResult {
  const provenance: HaProvenanceEnvelope = {
    ...base,
    source: "invalid",
    reason_codes: [...base.reason_codes, ...reasons],
  };
  return { ok: false, readings: [], provenance, reasons: provenance.reason_codes };
}

function buildReadingResult(args: {
  provenanceBase: HaProvenanceEnvelope;
  mapEntry: HaEntityMapping;
  freshness: FreshnessOutcome;
  value: number;
}): HaAdapterResult {
  const { provenanceBase, mapEntry, freshness, value } = args;
  const provenance: HaProvenanceEnvelope = {
    ...provenanceBase,
    source: freshness.source,
    captured_at: freshness.capturedAt,
    tent_id: mapEntry.tent_id,
    plant_id: mapEntry.plant_id ?? null,
    confidence: freshness.source === "live" ? 0.9 : 0.5,
    reason_codes: [...provenanceBase.reason_codes, ...freshness.reasons],
  };
  const readings: HaMetricReading[] =
    freshness.source === "live" && freshness.capturedAt
      ? [
          {
            metric: mapEntry.metric,
            value,
            tent_id: mapEntry.tent_id,
            plant_id: mapEntry.plant_id ?? null,
            captured_at: freshness.capturedAt,
            provenance,
            idempotency_key: buildHaIdempotencyKey({
              bridge: provenance.bridge,
              upstream_mode: provenance.upstream_mode,
              tent_id: mapEntry.tent_id,
              metric: mapEntry.metric,
              captured_at: freshness.capturedAt,
              value,
            }),
          },
        ]
      : [];
  return {
    ok: readings.length > 0,
    readings,
    provenance,
    reasons: provenance.reason_codes,
  };
}

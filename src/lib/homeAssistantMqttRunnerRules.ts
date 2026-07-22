/**
 * homeAssistantMqttRunnerRules — pure runner-side orchestration for Home
 * Assistant MQTT adapter modes.
 *
 * The local runner owns MQTT and file I/O. This module owns only:
 *   - strict, versioned configuration validation
 *   - deterministic HA JSON normalization
 *   - deterministic HA Statestream sibling-topic assembly
 *   - same-tent/channel VPD pairing
 *   - collision-resistant runner idempotency keys
 *
 * No fetch. No Supabase. No React. No timers. No device control.
 */

import {
  deriveVpdIfPaired,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  type HaAdapterResult,
  type HaCanonicalMetric,
  type HaJsonEnvelope,
  type HaMetricReading,
  type HaMqttMappingFile,
  type StatestreamAssembledMessage,
} from "@/lib/homeAssistantEcowittMqttAdapter";

export type HaRunnerAdapterMode = "ha_json" | "ha_statestream";

/**
 * Runner configuration extends the adapter's entity mapping with two explicit
 * transport fields. The runner never infers either from MQTT topic shape.
 */
export type HaMqttRunnerConfig = HaMqttMappingFile & {
  adapter_mode: HaRunnerAdapterMode;
  mqtt_topic: string;
};

const METRICS = new Set<HaCanonicalMetric>([
  "air_temp_f",
  "humidity_pct",
  "soil_moisture_pct",
  "soil_temp_f",
  "co2_ppm",
  "vpd_kpa",
]);

const HA_UPSTREAM_MODES = new Set([
  "ha_core_ecowitt_push",
  "ha_ecowitt_iot_poll",
]);

const CANONICAL_UNITS: Record<HaCanonicalMetric, string> = {
  air_temp_f: "°F",
  humidity_pct: "%",
  soil_moisture_pct: "%",
  soil_temp_f: "°F",
  co2_ppm: "ppm",
  vpd_kpa: "kPa",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Parse and validate a version-1 runner mapping without coercing bad input. */
export function parseHaMqttRunnerConfig(value: unknown): HaMqttRunnerConfig {
  if (!isRecord(value)) {
    throw new Error("HA MQTT mapping must be a JSON object");
  }
  if (value.version !== 1) {
    throw new Error("HA MQTT mapping version must be 1");
  }
  if (value.bridge !== "home_assistant") {
    throw new Error("HA MQTT runner mappings require bridge = home_assistant");
  }
  if (!HA_UPSTREAM_MODES.has(String(value.upstream_mode))) {
    throw new Error(
      "HA MQTT upstream_mode must be ha_core_ecowitt_push or ha_ecowitt_iot_poll",
    );
  }
  if (value.adapter_mode !== "ha_json" && value.adapter_mode !== "ha_statestream") {
    throw new Error("HA MQTT adapter_mode must be ha_json or ha_statestream");
  }
  if (!nonEmptyString(value.mqtt_topic)) {
    throw new Error("HA MQTT mapping must include a non-empty mqtt_topic");
  }
  if (!Array.isArray(value.entities) || value.entities.length === 0) {
    throw new Error("HA MQTT mapping must include at least one entity");
  }

  const seen = new Set<string>();
  for (const raw of value.entities) {
    if (!isRecord(raw)) {
      throw new Error("HA MQTT mapping entities must be objects");
    }
    if (!nonEmptyString(raw.entity_id) || !raw.entity_id.includes(".")) {
      throw new Error("HA MQTT mapping entity_id is invalid");
    }
    if (seen.has(raw.entity_id)) {
      throw new Error(`Duplicate HA MQTT entity mapping: ${raw.entity_id}`);
    }
    seen.add(raw.entity_id);
    if (!METRICS.has(raw.metric as HaCanonicalMetric)) {
      throw new Error(`Invalid metric for ${raw.entity_id}`);
    }
    if (!nonEmptyString(raw.tent_id)) {
      throw new Error(`Missing tent_id for ${raw.entity_id}`);
    }
    if (
      raw.plant_id !== undefined &&
      raw.plant_id !== null &&
      typeof raw.plant_id !== "string"
    ) {
      throw new Error(`Invalid plant_id for ${raw.entity_id}`);
    }
    if (
      raw.channel !== undefined &&
      raw.channel !== null &&
      typeof raw.channel !== "string"
    ) {
      throw new Error(`Invalid channel for ${raw.entity_id}`);
    }
  }

  if (value.adapter_mode === "ha_statestream") {
    if (!nonEmptyString(value.statestream_topic_prefix)) {
      throw new Error(
        "ha_statestream requires statestream_topic_prefix in the mapping file",
      );
    }
    const prefix = value.statestream_topic_prefix.replace(/\/+$/, "");
    if (!value.mqtt_topic.startsWith(`${prefix}/`)) {
      throw new Error(
        "ha_statestream mqtt_topic must be under statestream_topic_prefix",
      );
    }
  }

  return value as unknown as HaMqttRunnerConfig;
}

/** Config is authoritative; topic shape is never used to select an adapter. */
export function configuredAdapterMode(
  config: HaMqttRunnerConfig,
): HaRunnerAdapterMode {
  return config.adapter_mode;
}

/** Subscription topic is explicit configuration, never inferred. */
export function configuredSubscriptionTopic(config: HaMqttRunnerConfig): string {
  return config.mqtt_topic;
}

/**
 * Accept HA-native names plus small aliases commonly used by selective MQTT
 * automations. Missing source timestamps are intentionally not back-filled.
 */
export function normalizeHaJsonEnvelope(
  payload: unknown,
  config: HaMqttRunnerConfig,
): unknown {
  if (!isRecord(payload)) return payload;
  const attributes = isRecord(payload.attributes) ? payload.attributes : {};
  const entityId = nonEmptyString(payload.entity_id) ? payload.entity_id : null;
  const mapped = entityId
    ? config.entities.find((entry) => entry.entity_id === entityId)
    : undefined;

  const normalized: HaJsonEnvelope & Record<string, unknown> = {
    ...payload,
    state: payload.state ?? payload.value,
    unit_of_measurement:
      payload.unit_of_measurement ??
      payload.unit ??
      attributes.unit_of_measurement ??
      mapped?.expected_unit,
    last_updated:
      payload.last_updated ?? payload.captured_at ?? attributes.last_updated,
    last_changed: payload.last_changed ?? attributes.last_changed,
  };
  return normalized;
}

export interface RunnerMqttMessage {
  topic: string;
  payload: unknown;
  retained: boolean;
  receivedAt: Date;
  brokerReceivedAt?: Date | null;
  now?: Date;
}

export interface RunnerStatestreamAssemblyOutcome {
  assembled: StatestreamAssembledMessage;
  ready: boolean;
  duplicate: boolean;
  missing: Array<"source_timestamp" | "unit_of_measurement">;
}

interface StatestreamBuffer {
  entity_id: string;
  state?: unknown;
  attributes: Record<string, unknown>;
  stateRetained: boolean;
  receivedAt: Date;
  lastCompleteFingerprint?: string;
}

/**
 * Assemble the real MQTT Statestream sibling-topic wire shape:
 *   <prefix>/<domain>/<object_id>/state
 *   <prefix>/<domain>/<object_id>/last_updated
 *   <prefix>/<domain>/<object_id>/last_changed
 *   <prefix>/<domain>/<object_id>/<attribute_name>
 *
 * A legacy aggregate /attributes JSON object remains accepted as a
 * compatibility input, but it is never required.
 */
export class DeterministicHaStatestreamAssembler {
  private readonly prefix: string;
  private readonly config: HaMqttRunnerConfig;
  private readonly buffers = new Map<string, StatestreamBuffer>();

  constructor(config: HaMqttRunnerConfig) {
    if (config.adapter_mode !== "ha_statestream") {
      throw new Error(
        "DeterministicHaStatestreamAssembler requires ha_statestream config",
      );
    }
    this.config = config;
    this.prefix = config.statestream_topic_prefix!.replace(/\/+$/, "");
  }

  consume(message: RunnerMqttMessage): RunnerStatestreamAssemblyOutcome | null {
    const parsed = this.parseTopic(message.topic);
    if (!parsed) return null;

    const buffer = this.buffers.get(parsed.entity_id) ?? {
      entity_id: parsed.entity_id,
      attributes: {},
      stateRetained: false,
      receivedAt: message.receivedAt,
    };

    if (message.receivedAt.getTime() >= buffer.receivedAt.getTime()) {
      buffer.receivedAt = message.receivedAt;
    }

    if (parsed.leaf === "state") {
      buffer.state = decodePayload(message.payload);
      // Retained provenance belongs to the state reading. Later attribute
      // messages must never silently clear it.
      buffer.stateRetained = message.retained;
    } else if (parsed.leaf === "attributes") {
      const aggregate = decodeObjectPayload(message.payload);
      if (aggregate) {
        buffer.attributes = { ...buffer.attributes, ...aggregate };
      }
    } else {
      buffer.attributes = {
        ...buffer.attributes,
        [parsed.leaf]: decodePayload(message.payload),
      };
    }

    this.buffers.set(parsed.entity_id, buffer);
    if (buffer.state === undefined) return null;

    const mapped = this.config.entities.find(
      (entry) => entry.entity_id === parsed.entity_id,
    );
    const missing: RunnerStatestreamAssemblyOutcome["missing"] = [];

    if (mapped) {
      const hasTimestamp =
        nonEmptyString(buffer.attributes.last_updated) ||
        nonEmptyString(buffer.attributes.last_changed);
      if (!hasTimestamp) missing.push("source_timestamp");

      const needsUnit =
        mapped.metric === "air_temp_f" || mapped.metric === "soil_temp_f";
      if (
        needsUnit &&
        !nonEmptyString(buffer.attributes.unit_of_measurement) &&
        !nonEmptyString(mapped.expected_unit)
      ) {
        missing.push("unit_of_measurement");
      }
      if (
        needsUnit &&
        !nonEmptyString(buffer.attributes.unit_of_measurement) &&
        nonEmptyString(mapped.expected_unit)
      ) {
        buffer.attributes.unit_of_measurement = mapped.expected_unit;
      }
    }

    const assembled: StatestreamAssembledMessage = {
      entity_id: parsed.entity_id,
      state: buffer.state,
      attributes: { ...buffer.attributes },
      retained: buffer.stateRetained,
      receivedAt: buffer.receivedAt,
    };

    const ready = !mapped || missing.length === 0;
    const fingerprint = ready ? assemblyFingerprint(assembled) : null;
    const duplicate =
      fingerprint !== null && buffer.lastCompleteFingerprint === fingerprint;
    if (fingerprint !== null && !duplicate) {
      buffer.lastCompleteFingerprint = fingerprint;
      this.buffers.set(parsed.entity_id, buffer);
    }

    return { assembled, ready, duplicate, missing };
  }

  private parseTopic(topic: string): { entity_id: string; leaf: string } | null {
    if (!topic.startsWith(`${this.prefix}/`)) return null;
    const pieces = topic.slice(this.prefix.length + 1).split("/");
    if (pieces.length < 3) return null;
    const [domain, objectId, ...leafParts] = pieces;
    if (!domain || !objectId || leafParts.length === 0) return null;
    const leaf = leafParts.join("/");
    if (!leaf) return null;
    return { entity_id: `${domain}.${objectId}`, leaf };
  }
}

function decodePayload(payload: unknown): unknown {
  if (typeof payload !== "string") return payload;
  const text = payload.trim();
  if (!text) return "";
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function decodeObjectPayload(payload: unknown): Record<string, unknown> | null {
  const decoded = decodePayload(payload);
  return isRecord(decoded) ? decoded : null;
}

function assemblyFingerprint(message: StatestreamAssembledMessage): string {
  const attributes = Object.keys(message.attributes)
    .sort()
    .map((key) => [key, message.attributes[key]]);
  return JSON.stringify([
    message.entity_id,
    message.state,
    attributes,
    message.retained,
  ]);
}

export function buildRunnerHaIdempotencyKey(args: {
  provider: string;
  bridge: string;
  upstreamMode: string;
  entityIdentity: string;
  tentId: string;
  plantId: string | null;
  channelIdentity: string | null;
  metric: HaCanonicalMetric;
  capturedAt: string;
  value: number;
  canonicalUnit: string;
}): string {
  const value = Math.round(args.value * 1000) / 1000;
  return [
    "ha",
    args.provider,
    args.bridge,
    args.upstreamMode,
    args.entityIdentity,
    args.tentId,
    args.plantId ?? "-",
    args.channelIdentity ?? "-",
    args.metric,
    args.capturedAt,
    value.toString(),
    args.canonicalUnit,
  ].join("|");
}

export function applyRunnerHaIdempotency(args: {
  result: HaAdapterResult;
  entityId: string | null;
  config: HaMqttRunnerConfig;
}): HaAdapterResult {
  if (!args.entityId || args.result.readings.length === 0) return args.result;
  const mapped = args.config.entities.find(
    (entry) => entry.entity_id === args.entityId,
  );
  return {
    ...args.result,
    readings: args.result.readings.map((reading) => ({
      ...reading,
      idempotency_key: buildRunnerHaIdempotencyKey({
        provider: reading.provenance.provider,
        bridge: reading.provenance.bridge,
        upstreamMode: reading.provenance.upstream_mode,
        entityIdentity: args.entityId!,
        tentId: reading.tent_id,
        plantId: reading.plant_id,
        channelIdentity: mapped?.channel ?? null,
        metric: reading.metric,
        capturedAt: reading.captured_at,
        value: reading.value,
        canonicalUnit: CANONICAL_UNITS[reading.metric],
      }),
    })),
  };
}

interface IdentifiedReading {
  reading: HaMetricReading;
  entityId: string;
  channel: string | null;
}

interface PairCache {
  temp?: IdentifiedReading;
  rh?: IdentifiedReading;
  lastVpdKey?: string;
}

export type HaRunnerOutcomeStatus =
  | "processed"
  | "pending"
  | "duplicate"
  | "ignored";

export interface HaRunnerDryRunOutcome {
  status: HaRunnerOutcomeStatus;
  adapter_mode: HaRunnerAdapterMode;
  entity_id: string | null;
  result: HaAdapterResult | null;
  readings: HaMetricReading[];
  derived_vpd: HaMetricReading | null;
  reasons: string[];
  retained: boolean | null;
}

/** Stateful only for deterministic Statestream assembly and temp/RH pairing. */
export class HaMqttDryRunPipeline {
  private readonly config: HaMqttRunnerConfig;
  private readonly statestream: DeterministicHaStatestreamAssembler | null;
  private readonly pairs = new Map<string, PairCache>();

  constructor(config: HaMqttRunnerConfig) {
    this.config = config;
    this.statestream =
      config.adapter_mode === "ha_statestream"
        ? new DeterministicHaStatestreamAssembler(config)
        : null;
  }

  consume(message: RunnerMqttMessage): HaRunnerDryRunOutcome {
    if (this.config.adapter_mode === "ha_json") {
      return this.consumeHaJson(message);
    }
    return this.consumeStatestream(message);
  }

  private consumeHaJson(message: RunnerMqttMessage): HaRunnerDryRunOutcome {
    const decoded = decodePayload(message.payload);
    const normalized = normalizeHaJsonEnvelope(decoded, this.config);
    const entityId =
      isRecord(normalized) && nonEmptyString(normalized.entity_id)
        ? normalized.entity_id
        : null;
    const parsed = parseHaJsonMessage({
      topic: message.topic,
      payload: normalized,
      mapping: this.config,
      receivedAt: message.receivedAt,
      retained: message.retained,
      brokerReceivedAt: message.brokerReceivedAt ?? message.receivedAt,
      now: message.now ?? message.receivedAt,
    });
    return this.finish(entityId, parsed);
  }

  private consumeStatestream(message: RunnerMqttMessage): HaRunnerDryRunOutcome {
    const assembly = this.statestream!.consume(message);
    if (!assembly) {
      return {
        status: "ignored",
        adapter_mode: this.config.adapter_mode,
        entity_id: null,
        result: null,
        readings: [],
        derived_vpd: null,
        reasons: [],
        retained: null,
      };
    }
    if (!assembly.ready) {
      return {
        status: "pending",
        adapter_mode: this.config.adapter_mode,
        entity_id: assembly.assembled.entity_id,
        result: null,
        readings: [],
        derived_vpd: null,
        reasons: assembly.missing.map((reason) => `statestream_missing_${reason}`),
        retained: assembly.assembled.retained,
      };
    }
    if (assembly.duplicate) {
      return {
        status: "duplicate",
        adapter_mode: this.config.adapter_mode,
        entity_id: assembly.assembled.entity_id,
        result: null,
        readings: [],
        derived_vpd: null,
        reasons: ["duplicate_stable_assembly"],
        retained: assembly.assembled.retained,
      };
    }
    const parsed = parseHaStatestreamMessage({
      assembled: assembly.assembled,
      mapping: this.config,
      brokerReceivedAt: message.brokerReceivedAt ?? message.receivedAt,
      now: message.now ?? message.receivedAt,
    });
    return this.finish(assembly.assembled.entity_id, parsed);
  }

  private finish(
    entityId: string | null,
    parsed: HaAdapterResult,
  ): HaRunnerDryRunOutcome {
    const result = applyRunnerHaIdempotency({
      result: parsed,
      entityId,
      config: this.config,
    });
    const derived = this.maybeDeriveVpd(entityId, result);
    const readings = derived ? [...result.readings, derived] : [...result.readings];
    const merged: HaAdapterResult = {
      ...result,
      ok: readings.length > 0,
      readings,
    };
    return {
      status: "processed",
      adapter_mode: this.config.adapter_mode,
      entity_id: entityId,
      result: merged,
      readings,
      derived_vpd: derived,
      reasons: [...merged.reasons],
      retained: merged.provenance.retained,
    };
  }

  private maybeDeriveVpd(
    entityId: string | null,
    result: HaAdapterResult,
  ): HaMetricReading | null {
    if (!entityId || result.readings.length === 0) return null;
    const mapped = this.config.entities.find(
      (entry) => entry.entity_id === entityId,
    );
    const channel = mapped?.channel ?? null;
    let derived: HaMetricReading | null = null;

    for (const reading of result.readings) {
      if (
        reading.provenance.source !== "live" ||
        (reading.metric !== "air_temp_f" && reading.metric !== "humidity_pct")
      ) {
        continue;
      }
      const pairKey = [
        reading.tent_id,
        reading.plant_id ?? "-",
        channel ?? "-",
      ].join("|");
      const cache = this.pairs.get(pairKey) ?? {};
      const identified: IdentifiedReading = { reading, entityId, channel };
      if (reading.metric === "air_temp_f") cache.temp = identified;
      if (reading.metric === "humidity_pct") cache.rh = identified;
      this.pairs.set(pairKey, cache);
      if (!cache.temp || !cache.rh) continue;

      const candidate = deriveVpdIfPaired({
        temp: cache.temp.reading,
        rh: cache.rh.reading,
      });
      if (!("metric" in candidate)) continue;

      const entityIdentity = [cache.temp.entityId, cache.rh.entityId]
        .sort()
        .join("+");
      const channels = [cache.temp.channel, cache.rh.channel]
        .filter((value): value is string => !!value)
        .sort();
      const channelIdentity = channels.length > 0 ? channels.join("+") : null;
      const idempotencyKey = buildRunnerHaIdempotencyKey({
        provider: candidate.provenance.provider,
        bridge: candidate.provenance.bridge,
        upstreamMode: candidate.provenance.upstream_mode,
        entityIdentity,
        tentId: candidate.tent_id,
        plantId: candidate.plant_id,
        channelIdentity,
        metric: "vpd_kpa",
        capturedAt: candidate.captured_at,
        value: candidate.value,
        canonicalUnit: CANONICAL_UNITS.vpd_kpa,
      });
      if (cache.lastVpdKey === idempotencyKey) continue;
      cache.lastVpdKey = idempotencyKey;
      this.pairs.set(pairKey, cache);
      derived = { ...candidate, idempotency_key: idempotencyKey };
    }
    return derived;
  }
}

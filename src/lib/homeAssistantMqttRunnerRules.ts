/**
 * homeAssistantMqttRunnerRules — pure runner-side orchestration for Home
 * Assistant MQTT adapter modes.
 *
 * The local runner owns MQTT and file I/O. This module owns only:
 *   - strict, versioned configuration validation
 *   - deterministic HA JSON boundary normalization
 *   - readiness/deduplication around the canonical HA Statestream assembler
 *   - same-tent/plant/channel VPD pairing
 *
 * No fetch. No Supabase. No React. No timers. No device control.
 */

import {
  HaStatestreamAssembler,
  deriveVpdIfPaired,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  type HaAdapterResult,
  type HaJsonEnvelope,
  type HaMetricReading,
  type HaMqttMappingFile,
  type StatestreamAssembledMessage,
} from "@/lib/homeAssistantEcowittMqttAdapter";

export type HaRunnerAdapterMode = "ha_json" | "ha_statestream";

/**
 * Runner configuration extends the adapter mapping with explicit routing.
 * The runner never infers adapter mode or subscription from topic shape.
 */
export type HaMqttRunnerConfig = HaMqttMappingFile & {
  adapter_mode: HaRunnerAdapterMode;
  mqtt_topic: string;
};

const HA_UPSTREAM_MODES = new Set([
  "ha_core_ecowitt_push",
  "ha_ecowitt_iot_poll",
]);

const METRICS = new Set([
  "air_temp_f",
  "humidity_pct",
  "soil_moisture_pct",
  "soil_temp_f",
  "co2_ppm",
  "vpd_kpa",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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
    if (!METRICS.has(String(raw.metric))) {
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

export function configuredAdapterMode(
  config: HaMqttRunnerConfig,
): HaRunnerAdapterMode {
  return config.adapter_mode;
}

export function configuredSubscriptionTopic(config: HaMqttRunnerConfig): string {
  return config.mqtt_topic;
}

/**
 * Lift common selective-automation aliases/attribute fields into the adapter's
 * canonical envelope boundary. Source timestamps are never invented.
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

/**
 * Thin readiness/deduplication wrapper around the canonical adapter assembler.
 * The canonical assembler owns the actual sibling-topic wire contract.
 */
export class DeterministicHaStatestreamCoordinator {
  private readonly config: HaMqttRunnerConfig;
  private readonly assembler: HaStatestreamAssembler;
  private readonly lastCompleteFingerprint = new Map<string, string>();

  constructor(config: HaMqttRunnerConfig) {
    if (config.adapter_mode !== "ha_statestream") {
      throw new Error(
        "DeterministicHaStatestreamCoordinator requires ha_statestream config",
      );
    }
    this.config = config;
    this.assembler = new HaStatestreamAssembler(
      config.statestream_topic_prefix!,
    );
  }

  consume(message: RunnerMqttMessage): RunnerStatestreamAssemblyOutcome | null {
    const assembled = this.assembler.consume({
      topic: message.topic,
      payload: message.payload,
      retained: message.retained,
      receivedAt: message.receivedAt,
    });
    if (!assembled) return null;

    const mapped = this.config.entities.find(
      (entry) => entry.entity_id === assembled.entity_id,
    );
    const missing: RunnerStatestreamAssemblyOutcome["missing"] = [];
    let normalized = assembled;

    if (mapped) {
      if (!assembled.last_updated && !assembled.last_changed) {
        missing.push("source_timestamp");
      }
      const needsUnit =
        mapped.metric === "air_temp_f" || mapped.metric === "soil_temp_f";
      const unit =
        assembled.attribute_cache.unit_of_measurement ??
        assembled.attribute_cache.unit;
      if (needsUnit && !nonEmptyString(unit) && !mapped.expected_unit) {
        missing.push("unit_of_measurement");
      }
      if (needsUnit && !nonEmptyString(unit) && mapped.expected_unit) {
        normalized = {
          ...assembled,
          attribute_cache: {
            ...assembled.attribute_cache,
            unit_of_measurement: mapped.expected_unit,
          },
        };
      }
    }

    const ready = !mapped || missing.length === 0;
    const fingerprint = ready ? assemblyFingerprint(normalized) : null;
    const previous = this.lastCompleteFingerprint.get(normalized.entity_id);
    const duplicate = fingerprint !== null && previous === fingerprint;
    if (fingerprint !== null && !duplicate) {
      this.lastCompleteFingerprint.set(normalized.entity_id, fingerprint);
    }

    return { assembled: normalized, ready, duplicate, missing };
  }
}

function assemblyFingerprint(message: StatestreamAssembledMessage): string {
  return JSON.stringify([
    message.entity_id,
    message.state,
    message.last_updated,
    message.last_changed,
    message.attribute_cache,
    message.state_retained,
  ]);
}

function decodeJsonPayload(payload: unknown): unknown {
  if (typeof payload !== "string") return payload;
  const text = payload.trim();
  if (!text) return "";
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

interface PairCache {
  temp?: HaMetricReading;
  rh?: HaMetricReading;
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

/** Stateful only for Statestream readiness/deduplication and VPD pairing. */
export class HaMqttDryRunPipeline {
  private readonly config: HaMqttRunnerConfig;
  private readonly statestream: DeterministicHaStatestreamCoordinator | null;
  private readonly pairs = new Map<string, PairCache>();

  constructor(config: HaMqttRunnerConfig) {
    this.config = config;
    this.statestream =
      config.adapter_mode === "ha_statestream"
        ? new DeterministicHaStatestreamCoordinator(config)
        : null;
  }

  consume(message: RunnerMqttMessage): HaRunnerDryRunOutcome {
    if (this.config.adapter_mode === "ha_json") {
      return this.consumeHaJson(message);
    }
    return this.consumeStatestream(message);
  }

  private consumeHaJson(message: RunnerMqttMessage): HaRunnerDryRunOutcome {
    const decoded = decodeJsonPayload(message.payload);
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
        retained: assembly.assembled.state_retained,
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
        retained: assembly.assembled.state_retained,
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
    result: HaAdapterResult,
  ): HaRunnerDryRunOutcome {
    const derived = this.maybeDeriveVpd(result);
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

  private maybeDeriveVpd(result: HaAdapterResult): HaMetricReading | null {
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
        reading.channel ?? "-",
      ].join("|");
      const cache = this.pairs.get(pairKey) ?? {};
      if (reading.metric === "air_temp_f") cache.temp = reading;
      if (reading.metric === "humidity_pct") cache.rh = reading;
      this.pairs.set(pairKey, cache);
      if (!cache.temp || !cache.rh) continue;

      const candidate = deriveVpdIfPaired({
        temp: cache.temp,
        rh: cache.rh,
      });
      if (!("metric" in candidate)) continue;
      if (cache.lastVpdKey === candidate.idempotency_key) continue;
      cache.lastVpdKey = candidate.idempotency_key;
      this.pairs.set(pairKey, cache);
      derived = candidate;
    }
    return derived;
  }
}

#!/usr/bin/env -S bun run
/**
 * Local EcoWitt MQTT → Verdant ingest runner.
 *
 * Subscribes to a local MQTT broker (default mqtt://127.0.0.1:1883,
 * topic `ecowitt/grow`), normalizes each EcoWitt JSON payload, builds
 * the canonical webhook payload, and POSTs to the existing validated
 * `sensor-ingest-webhook` Edge Function.
 *
 * Adapter routing is CONFIGURATION-BASED ONLY. The runner selects its
 * upstream adapter mode strictly from the `UPSTREAM_MODE` env knob —
 * never from topic shapes, payload sniffing, or any other inference.
 * Valid modes:
 *   - ecowitt_raw     — the existing ecowitt2mqtt raw path, unchanged.
 *   - ha_json         — Home Assistant selective-JSON envelopes, dry-run only.
 *   - ha_statestream  — Home Assistant MQTT Statestream separate-topic
 *                       wire format, assembled per entity, dry-run only.
 * A missing or invalid mode fails closed at startup with an explicit
 * error listing the valid modes. There is no silent default.
 *
 * The HA modes additionally REQUIRE `HA_MQTT_MAPPING_PATH` — a
 * filesystem path to the exact-entity mapping JSON (see
 * fixtures/home-assistant-ecowitt-mqtt/example-mapping.json). The file
 * is read once at startup, read-only. A missing, unreadable, or invalid
 * mapping fails closed with a path-safe error that never echoes file
 * contents.
 *
 * HA modes are dry-run only: they normalize through the pure
 * homeAssistantEcowittMqttAdapter, print evidence reports with hav2
 * idempotency keys, and never POST, never store, and never touch any
 * automation surface. Broker receive time is audit metadata only and is
 * never used as captured_at.
 *
 * Safety rules:
 *   - No Supabase SDK import. No direct DB writes. No service-role key.
 *   - No device control. No automation. No alert dispatch.
 *   - Bridge tokens are NEVER logged in plaintext.
 *   - Stale / invalid payloads are reported and never POSTed as live.
 *
 * Flags:
 *   --dry-run    Normalize + report only. No network call.
 *   --once       Process the next single message (or sample) then exit.
 *   --sample     Use a built-in fresh sample payload (no MQTT needed). ecowitt_raw only.
 *   --invalid    Use a built-in impossible sample payload (no MQTT needed). ecowitt_raw only.
 *
 * Env:
 *   UPSTREAM_MODE        (required: ecowitt_raw | ha_json | ha_statestream)
 *   HA_MQTT_MAPPING_PATH (required for ha_json / ha_statestream)
 *   VERDANT_INGEST_URL   (required for live POST; ecowitt_raw only)
 *   VERDANT_BRIDGE_TOKEN (required for live POST; ecowitt_raw only)
 *   VERDANT_TENT_ID      (required; ecowitt_raw only)
 *   VERDANT_PLANT_ID     (optional, metadata only)
 *   ECOWITT_MQTT_URL     (default mqtt://127.0.0.1:1883)
 *   ECOWITT_MQTT_TOPIC   (default ecowitt/grow; ecowitt_raw + ha_json subscribe topic)
 *   ECOWITT_MQTT_USERNAME (optional)
 *   ECOWITT_MQTT_PASSWORD (optional)
 */

import { readFileSync } from "node:fs";
import {
  buildEcowittLocalTestPayload,
  redactBridgeToken,
} from "../../src/lib/ecowittLocalTestPayloadRules";
import {
  normalizeEcowittMqttPayload,
  buildEcowittIngestEvidence,
  type EcowittMqttPayload,
  type EcowittIngestEvidence,
} from "../../src/lib/ecowittMqttIngestRules";
import { buildIngestAttemptReport } from "../../src/lib/ingestAttemptReportRules";
import {
  HaStatestreamAssembler,
  deriveVpdIfPaired,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  type HaAdapterResult,
  type HaMetricReading,
  type HaMqttMappingFile,
} from "../../src/lib/homeAssistantEcowittMqttAdapter";

export const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";
export const DEFAULT_MQTT_TOPIC = "ecowitt/grow";

interface CliFlags {
  dryRun: boolean;
  once: boolean;
  sample: boolean;
  invalid: boolean;
  writeReport?: boolean;
}

export const DEFAULT_REPORT_PATH = "./tmp/ecowitt-last-ingest-report.json";

export function parseFlags(argv: readonly string[]): CliFlags {
  return {
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
    sample: argv.includes("--sample"),
    invalid: argv.includes("--invalid"),
    writeReport: argv.includes("--write-report"),
  };
}

interface RuntimeEnv {
  url: string | null;
  token: string | null;
  tentId: string | null;
  plantId: string | null;
  mqttUrl: string;
  mqttTopic: string;
  mqttUsername: string | null;
  mqttPassword: string | null;
}

export function readEnv(env: NodeJS.ProcessEnv): RuntimeEnv {
  return {
    url: env.VERDANT_INGEST_URL ?? null,
    token: env.VERDANT_BRIDGE_TOKEN ?? null,
    tentId: env.VERDANT_TENT_ID ?? null,
    plantId: env.VERDANT_PLANT_ID ?? null,
    mqttUrl: env.ECOWITT_MQTT_URL ?? DEFAULT_MQTT_URL,
    mqttTopic: env.ECOWITT_MQTT_TOPIC ?? DEFAULT_MQTT_TOPIC,
    mqttUsername: env.ECOWITT_MQTT_USERNAME ?? null,
    mqttPassword: env.ECOWITT_MQTT_PASSWORD ?? null,
  };
}

// ---------------------------------------------------------------------------
// Configuration-based adapter routing (never inferred from topic shapes)
// ---------------------------------------------------------------------------

/**
 * Runner adapter modes — matches the adapter's HaAdapterMode vocabulary
 * (`ecowitt_raw` | `ha_json` | `ha_statestream`). This is the runner's
 * `upstream_mode` knob; it is distinct from the mapping file's own
 * `upstream_mode` field, which records HA-side provenance
 * (ha_core_ecowitt_push / ha_ecowitt_iot_poll / ...).
 */
export const RUNNER_UPSTREAM_MODES = [
  "ecowitt_raw",
  "ha_json",
  "ha_statestream",
] as const;
export type RunnerUpstreamMode = (typeof RUNNER_UPSTREAM_MODES)[number];

export class RunnerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerConfigError";
  }
}

const VALID_MODES_HELP = `valid values: ${RUNNER_UPSTREAM_MODES.join(", ")}`;

/**
 * Resolve the adapter mode STRICTLY from configuration. Missing or
 * invalid values fail closed — the runner never infers a mode from
 * topic shapes, payload contents, or anything else.
 */
export function resolveUpstreamMode(env: NodeJS.ProcessEnv): RunnerUpstreamMode {
  const raw = env.UPSTREAM_MODE;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new RunnerConfigError(
      `UPSTREAM_MODE is required and was not set. The runner never infers its adapter mode from topic shapes (${VALID_MODES_HELP}).`,
    );
  }
  const mode = raw.trim();
  if (!(RUNNER_UPSTREAM_MODES as readonly string[]).includes(mode)) {
    throw new RunnerConfigError(
      `UPSTREAM_MODE is not a valid mode (${VALID_MODES_HELP}).`,
    );
  }
  return mode as RunnerUpstreamMode;
}

const HA_MAPPING_BRIDGES = ["home_assistant", "ecowitt2mqtt"] as const;
const HA_MAPPING_UPSTREAM_MODES = [
  "ha_core_ecowitt_push",
  "ha_ecowitt_iot_poll",
  "ecowitt_custom_upload",
  "unknown",
] as const;
const HA_MAPPING_METRICS = [
  "air_temp_f",
  "humidity_pct",
  "soil_moisture_pct",
  "soil_temp_f",
  "co2_ppm",
  "vpd_kpa",
] as const;
const HA_MAPPING_EXPECTED_UNITS = ["°F", "°C", "%", "ppm", "kPa"] as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Validate the parsed mapping JSON. Errors are PATH-SAFE: they name the
 * mapping path and the structural location of the failing field using
 * OUR schema vocabulary only — they never echo file contents or field
 * values.
 */
export function validateHaMappingFile(
  parsed: unknown,
  opts: { path: string; requireStatestreamPrefix: boolean },
): HaMqttMappingFile {
  const fail = (detail: string): never => {
    throw new RunnerConfigError(
      `HA_MQTT_MAPPING_PATH mapping failed validation (${detail}): ${opts.path}`,
    );
  };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("top-level value must be a JSON object");
  }
  const m = parsed as Record<string, unknown>;
  if (m.version !== 1) fail("version must be the number 1");
  if (!(HA_MAPPING_BRIDGES as readonly string[]).includes(m.bridge as string)) {
    fail(`bridge must be one of: ${HA_MAPPING_BRIDGES.join(", ")}`);
  }
  if (
    !(HA_MAPPING_UPSTREAM_MODES as readonly string[]).includes(
      m.upstream_mode as string,
    )
  ) {
    fail(`upstream_mode must be one of: ${HA_MAPPING_UPSTREAM_MODES.join(", ")}`);
  }
  if (
    m.statestream_topic_prefix !== undefined &&
    !isNonEmptyString(m.statestream_topic_prefix)
  ) {
    fail("statestream_topic_prefix must be a non-empty string when present");
  }
  if (opts.requireStatestreamPrefix && !isNonEmptyString(m.statestream_topic_prefix)) {
    fail("statestream_topic_prefix is required for UPSTREAM_MODE=ha_statestream");
  }
  if (!Array.isArray(m.entities) || m.entities.length === 0) {
    fail("entities must be a non-empty array");
  }
  const seenEntityIds = new Set<string>();
  (m.entities as unknown[]).forEach((e, i) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      fail(`entities[${i}] must be an object`);
    }
    const ent = e as Record<string, unknown>;
    if (!isNonEmptyString(ent.entity_id) || !(ent.entity_id as string).includes(".")) {
      fail(`entities[${i}].entity_id must be a non-empty "<domain>.<object_id>" string`);
    }
    if (seenEntityIds.has(ent.entity_id as string)) {
      fail(`entities[${i}].entity_id duplicates an earlier entry`);
    }
    seenEntityIds.add(ent.entity_id as string);
    if (!(HA_MAPPING_METRICS as readonly string[]).includes(ent.metric as string)) {
      fail(`entities[${i}].metric must be one of: ${HA_MAPPING_METRICS.join(", ")}`);
    }
    if (!isNonEmptyString(ent.tent_id)) {
      fail(`entities[${i}].tent_id must be a non-empty string`);
    }
    if (ent.plant_id !== undefined && ent.plant_id !== null && !isNonEmptyString(ent.plant_id)) {
      fail(`entities[${i}].plant_id must be null or a non-empty string`);
    }
    if (ent.channel !== undefined && ent.channel !== null && !isNonEmptyString(ent.channel)) {
      fail(`entities[${i}].channel must be null or a non-empty string`);
    }
    if (
      ent.expected_unit !== undefined &&
      !(HA_MAPPING_EXPECTED_UNITS as readonly string[]).includes(
        ent.expected_unit as string,
      )
    ) {
      fail(
        `entities[${i}].expected_unit must be one of: ${HA_MAPPING_EXPECTED_UNITS.join(", ")}`,
      );
    }
  });
  return m as unknown as HaMqttMappingFile;
}

/**
 * Load the mapping file ONCE, read-only. Every failure path is
 * fail-closed and path-safe: the raised error names the path but never
 * echoes file contents, JSON parser detail (which can quote a snippet
 * of the file), or filesystem error detail.
 */
export function loadHaMappingFile(args: {
  path: string;
  requireStatestreamPrefix: boolean;
  readFile?: (p: string) => string;
}): HaMqttMappingFile {
  const read = args.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  let text: string;
  try {
    text = read(args.path);
  } catch {
    throw new RunnerConfigError(
      `HA_MQTT_MAPPING_PATH file could not be read: ${args.path}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new RunnerConfigError(
      `HA_MQTT_MAPPING_PATH file is not valid JSON: ${args.path}`,
    );
  }
  return validateHaMappingFile(parsed, {
    path: args.path,
    requireStatestreamPrefix: args.requireStatestreamPrefix,
  });
}

export interface RunnerModeConfig {
  upstreamMode: RunnerUpstreamMode;
  mappingPath: string | null;
  mapping: HaMqttMappingFile | null;
}

/**
 * Resolve the full mode configuration from env. Fail-closed rules:
 *   - missing/invalid UPSTREAM_MODE → RunnerConfigError listing valid modes
 *   - ha_json / ha_statestream without HA_MQTT_MAPPING_PATH → RunnerConfigError
 *   - unreadable / invalid-JSON / invalid-shape mapping → RunnerConfigError
 *     (path-safe; file contents are never echoed)
 * The existing ecowitt_raw path keeps its current config surface exactly
 * and never touches the mapping file.
 */
export function resolveRunnerModeConfig(
  env: NodeJS.ProcessEnv,
  readFile?: (p: string) => string,
): RunnerModeConfig {
  const upstreamMode = resolveUpstreamMode(env);
  if (upstreamMode === "ecowitt_raw") {
    return { upstreamMode, mappingPath: null, mapping: null };
  }
  const mappingPath = env.HA_MQTT_MAPPING_PATH;
  if (!isNonEmptyString(mappingPath)) {
    throw new RunnerConfigError(
      `HA_MQTT_MAPPING_PATH is required when UPSTREAM_MODE=${upstreamMode}. Point it at the exact-entity mapping JSON (shape: fixtures/home-assistant-ecowitt-mqtt/example-mapping.json).`,
    );
  }
  const mapping = loadHaMappingFile({
    path: mappingPath.trim(),
    requireStatestreamPrefix: upstreamMode === "ha_statestream",
    readFile,
  });
  return { upstreamMode, mappingPath: mappingPath.trim(), mapping };
}

// ---------------------------------------------------------------------------
// HA dry-run pipeline (ha_json + ha_statestream)
// ---------------------------------------------------------------------------

/** Cap on the retained hav2 key list in the dry-run state (audit only). */
export const HA_DRY_RUN_MAX_TRACKED_KEYS = 1000;

export interface HaDryRunState {
  upstreamMode: RunnerUpstreamMode;
  /** Persistent per-run Statestream assembler (ha_statestream only). */
  assembler: HaStatestreamAssembler | null;
  messagesConsumed: number;
  /** Unique readings emitted (deduped by hav2 idempotency key). */
  readingsEmitted: number;
  /** Readings whose hav2 key was already seen this run (replays / re-assembly). */
  duplicatesSuppressed: number;
  /** Every reason observed, counted — nothing is dropped silently. */
  reasonCounts: Record<string, number>;
  /** Ordered unique hav2 keys (capped at HA_DRY_RUN_MAX_TRACKED_KEYS). */
  idempotencyKeys: string[];
  /**
   * Latest validated live temp/RH readings keyed by exact
   * tent + plant + configured channel identity. The runner never pairs
   * across channels or targets, and stale/invalid adapter results never
   * enter this cache.
   */
  vpdPairCache: Map<
    string,
    { temp: HaMetricReading | null; rh: HaMetricReading | null }
  >;
  seenKeys: Set<string>;
}

export function createHaDryRunState(config: RunnerModeConfig): HaDryRunState {
  if (config.upstreamMode === "ecowitt_raw" || !config.mapping) {
    throw new RunnerConfigError(
      "HA dry-run state requires UPSTREAM_MODE=ha_json or ha_statestream with a loaded mapping.",
    );
  }
  return {
    upstreamMode: config.upstreamMode,
    assembler:
      config.upstreamMode === "ha_statestream"
        ? new HaStatestreamAssembler(config.mapping.statestream_topic_prefix as string)
        : null,
    messagesConsumed: 0,
    readingsEmitted: 0,
    duplicatesSuppressed: 0,
    reasonCounts: {},
    idempotencyKeys: [],
    vpdPairCache: new Map(),
    seenKeys: new Set<string>(),
  };
}

export interface HaDryRunReading {
  metric: string;
  value: number;
  entity_id: string;
  tent_id: string;
  plant_id: string | null;
  channel: string | null;
  captured_at: string;
  idempotency_key: string;
}

export interface HaDryRunReport {
  mode: RunnerUpstreamMode;
  dry_run: true;
  posted: false;
  topic: string;
  retained: boolean;
  /**
   * reading  — adapter emitted at least one validated reading
   * rejected — adapter evaluated the message and rejected it (reasons listed)
   * buffered — statestream part consumed into the assembler; state not yet known
   * ignored  — statestream topic outside the configured prefix / malformed shape
   */
  outcome: "reading" | "rejected" | "buffered" | "ignored";
  source: "live" | "stale" | "invalid" | null;
  reasons: string[];
  readings: HaDryRunReading[];
  reason_counts: Record<string, number>;
  messages_consumed: number;
  readings_emitted: number;
  duplicates_suppressed: number;
}

function countReason(state: HaDryRunState, reason: string): void {
  state.reasonCounts[reason] = (state.reasonCounts[reason] ?? 0) + 1;
}

function haReport(args: {
  state: HaDryRunState;
  topic: string;
  retained: boolean;
  outcome: HaDryRunReport["outcome"];
  source: HaDryRunReport["source"];
  reasons: string[];
  readings: HaDryRunReading[];
}): HaDryRunReport {
  const { state } = args;
  return {
    mode: state.upstreamMode,
    dry_run: true,
    posted: false,
    topic: args.topic,
    retained: args.retained,
    outcome: args.outcome,
    source: args.source,
    reasons: [...args.reasons],
    readings: args.readings,
    reason_counts: { ...state.reasonCounts },
    messages_consumed: state.messagesConsumed,
    readings_emitted: state.readingsEmitted,
    duplicates_suppressed: state.duplicatesSuppressed,
  };
}

/**
 * Classify a Statestream part the assembler returned null for. This is
 * bookkeeping about the CONFIGURED prefix — not topic-based mode
 * inference (the mode was already fixed by config before this runs).
 */
function classifyUnassembledStatestreamPart(
  topic: string,
  prefix: string,
): "statestream_part_buffered" | "statestream_topic_ignored" {
  const clean = prefix.replace(/\/+$/, "");
  if (!topic.startsWith(clean + "/")) return "statestream_topic_ignored";
  const rest = topic.slice(clean.length + 1).split("/");
  if (rest.length !== 3 || rest.some((seg) => seg.length === 0)) {
    return "statestream_topic_ignored";
  }
  return "statestream_part_buffered";
}

function haVpdPairIdentity(reading: HaMetricReading): string {
  return JSON.stringify([
    reading.tent_id,
    reading.plant_id ?? null,
    reading.channel ?? null,
  ]);
}

/**
 * Add a derived VPD reading only when the canonical adapter has emitted
 * validated LIVE temperature and humidity readings for the same exact
 * tent/plant/channel identity. The adapter owns Tetens math, the two-minute
 * pairing window, provenance, and the hav2 idempotency preimage.
 */
function appendDerivedVpdReadings(
  state: HaDryRunState,
  incoming: readonly HaMetricReading[],
): HaMetricReading[] {
  const output = [...incoming];

  for (const reading of incoming) {
    if (
      reading.provenance.source !== "live" ||
      (reading.metric !== "air_temp_f" && reading.metric !== "humidity_pct")
    ) {
      continue;
    }

    const identity = haVpdPairIdentity(reading);
    const pair = state.vpdPairCache.get(identity) ?? { temp: null, rh: null };
    if (reading.metric === "air_temp_f") pair.temp = reading;
    else pair.rh = reading;
    state.vpdPairCache.set(identity, pair);

    if (!pair.temp || !pair.rh) continue;

    const derived = deriveVpdIfPaired({ temp: pair.temp, rh: pair.rh });
    if ("metric" in derived) {
      output.push(derived);
    } else {
      countReason(state, derived.reason);
    }
  }

  return output;
}

function adapterResultToDryRunReport(args: {
  state: HaDryRunState;
  topic: string;
  retained: boolean;
  result: HaAdapterResult;
}): HaDryRunReport {
  const { state, result } = args;
  for (const reason of result.reasons) countReason(state, reason);
  const readingsWithDerivedVpd = appendDerivedVpdReadings(
    state,
    result.readings,
  );
  const readings: HaDryRunReading[] = readingsWithDerivedVpd.map((r) => ({
    metric: r.metric,
    value: r.value,
    entity_id: r.entity_id,
    tent_id: r.tent_id,
    plant_id: r.plant_id,
    channel: r.channel,
    captured_at: r.captured_at,
    idempotency_key: r.idempotency_key,
  }));
  for (const r of readings) {
    if (state.seenKeys.has(r.idempotency_key)) {
      state.duplicatesSuppressed += 1;
      continue;
    }
    state.seenKeys.add(r.idempotency_key);
    if (state.idempotencyKeys.length < HA_DRY_RUN_MAX_TRACKED_KEYS) {
      state.idempotencyKeys.push(r.idempotency_key);
    }
    state.readingsEmitted += 1;
  }
  return haReport({
    state,
    topic: args.topic,
    retained: args.retained,
    outcome: result.ok ? "reading" : "rejected",
    source: result.provenance.source,
    reasons: [...result.reasons],
    readings,
  });
}

/**
 * Feed one incoming MQTT message through the configured HA adapter mode.
 * Dry-run only: no fetch, no POST, no persistence. Broker receive time
 * is passed to the adapter as audit metadata only — it is never used as
 * captured_at.
 */
export function handleHaMessage(args: {
  topic: string;
  payloadText: string;
  retained: boolean;
  receivedAt?: Date;
  config: RunnerModeConfig;
  state: HaDryRunState;
  now?: Date;
}): HaDryRunReport {
  const { config, state } = args;
  if (!config.mapping || config.upstreamMode === "ecowitt_raw") {
    throw new RunnerConfigError(
      "handleHaMessage requires UPSTREAM_MODE=ha_json or ha_statestream with a loaded mapping.",
    );
  }
  const receivedAt = args.receivedAt ?? new Date();
  state.messagesConsumed += 1;

  if (config.upstreamMode === "ha_statestream") {
    const assembled = (state.assembler as HaStatestreamAssembler).consume({
      topic: args.topic,
      payload: args.payloadText,
      retained: args.retained,
      receivedAt,
    });
    if (!assembled) {
      const reason = classifyUnassembledStatestreamPart(
        args.topic,
        config.mapping.statestream_topic_prefix as string,
      );
      countReason(state, reason);
      return haReport({
        state,
        topic: args.topic,
        retained: args.retained,
        outcome: reason === "statestream_part_buffered" ? "buffered" : "ignored",
        source: null,
        reasons: [reason],
        readings: [],
      });
    }
    const result = parseHaStatestreamMessage({
      assembled,
      mapping: config.mapping,
      brokerReceivedAt: receivedAt,
      now: args.now,
    });
    return adapterResultToDryRunReport({
      state,
      topic: args.topic,
      retained: args.retained,
      result,
    });
  }

  // ha_json — one HA JSON envelope per message.
  let payload: unknown;
  try {
    payload = JSON.parse(args.payloadText) as unknown;
  } catch {
    countReason(state, "malformed_payload");
    return haReport({
      state,
      topic: args.topic,
      retained: args.retained,
      outcome: "rejected",
      source: "invalid",
      reasons: ["malformed_payload"],
      readings: [],
    });
  }
  const result = parseHaJsonMessage({
    topic: args.topic,
    payload,
    mapping: config.mapping,
    receivedAt,
    retained: args.retained,
    brokerReceivedAt: receivedAt,
    now: args.now,
  });
  return adapterResultToDryRunReport({
    state,
    topic: args.topic,
    retained: args.retained,
    result,
  });
}

/**
 * Route the HA dry-run outcome through the SAME downstream report
 * presenter the raw dry-run path uses. url/token are structurally
 * absent in HA modes — the report builder never sees them, so no POST
 * target or credential can leak into HA-mode output.
 */
export function buildHaAttemptReport(
  report: HaDryRunReport,
): ReturnType<typeof buildIngestAttemptReport> {
  return buildIngestAttemptReport({
    url: null,
    token: null,
    tentId: report.readings[0]?.tent_id ?? null,
    dryRun: true,
    normalizerReasons: report.reasons,
    metricKeys: report.readings.map((r) => r.metric),
  });
}

function printHaDryRunReport(report: HaDryRunReport): void {
  if (report.outcome === "reading" || report.outcome === "rejected") {
    printReport(buildHaAttemptReport(report));
  }
  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] ha dry-run detail", {
    mode: report.mode,
    dry_run: report.dry_run,
    posted: report.posted,
    topic: report.topic,
    retained: report.retained,
    outcome: report.outcome,
    source: report.source,
    reasons: report.reasons,
    readings: report.readings,
    reason_counts: report.reason_counts,
    messages_consumed: report.messages_consumed,
    readings_emitted: report.readings_emitted,
    duplicates_suppressed: report.duplicates_suppressed,
    note: "dry-run only — nothing was posted, stored, or controlled",
  });
}

// ---------------------------------------------------------------------------
// Incoming-message dispatch (strictly config-routed)
// ---------------------------------------------------------------------------

export type IncomingMessageOutcome =
  | { kind: "ecowitt_raw"; parsed: boolean; result: HandleResult }
  | { kind: "ha_dry_run"; report: HaDryRunReport };

/**
 * Single dispatch seam for every incoming MQTT message. The adapter
 * branch is selected ONLY by `config.upstreamMode` — the topic string
 * never selects a parser. A statestream-shaped topic arriving in
 * ecowitt_raw mode is parsed as a raw EcoWitt JSON payload (and
 * typically rejected as malformed); it is never statestream-assembled.
 */
export async function handleIncomingMqttMessage(args: {
  topic: string;
  payloadText: string;
  retained: boolean;
  config: RunnerModeConfig;
  env: RuntimeEnv;
  flags: CliFlags;
  haState: HaDryRunState | null;
  fetchImpl?: typeof fetch;
  receivedAt?: Date;
  now?: Date;
}): Promise<IncomingMessageOutcome> {
  if (args.config.upstreamMode === "ecowitt_raw") {
    let payload: EcowittMqttPayload;
    try {
      payload = JSON.parse(args.payloadText) as EcowittMqttPayload;
    } catch {
      const report = buildIngestAttemptReport({
        url: args.env.url,
        token: args.env.token,
        dryRun: true,
        normalizerReasons: ["malformed_payload"],
      });
      printReport(report);
      return {
        kind: "ecowitt_raw",
        parsed: false,
        result: {
          reasons: ["malformed_payload"],
          posted: false,
          classification: report.classification,
          status: report.status,
        },
      };
    }
    const result = await handlePayload(
      payload,
      args.env,
      args.flags,
      args.fetchImpl ?? fetch,
      args.receivedAt ?? new Date(),
    );
    return { kind: "ecowitt_raw", parsed: true, result };
  }

  if (!args.haState) {
    throw new RunnerConfigError(
      "HA modes require an initialized dry-run state (createHaDryRunState).",
    );
  }
  const report = handleHaMessage({
    topic: args.topic,
    payloadText: args.payloadText,
    retained: args.retained,
    receivedAt: args.receivedAt,
    config: args.config,
    state: args.haState,
    now: args.now,
  });
  printHaDryRunReport(report);
  return { kind: "ha_dry_run", report };
}

export function buildSamplePayload(invalid: boolean): EcowittMqttPayload {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  if (invalid) {
    return {
      dateutc: now,
      tempf: 7431,
      humidity: 250,
      co2: 99999,
      stationtype: "GW1200",
    };
  }
  return {
    dateutc: now,
    tempf: 78.6,
    humidity: 56,
    soilmoisture1: 45,
    co2: 720,
    stationtype: "GW1200",
  };
}

interface HandleResult {
  reasons: string[];
  posted: boolean;
  classification: string;
  status: string;
}

async function handlePayload(
  payload: EcowittMqttPayload,
  env: RuntimeEnv,
  flags: CliFlags,
  fetchImpl: typeof fetch = fetch,
  receivedAt: Date = new Date(),
): Promise<HandleResult> {
  const norm = normalizeEcowittMqttPayload({
    payload,
    tentId: env.tentId,
    plantId: env.plantId,
  });

  const metricKeys = norm.draft
    ? Object.entries({
        temp_f: norm.draft.air_temp_f,
        humidity_pct: norm.draft.humidity_pct,
        vpd_kpa: norm.draft.vpd_kpa,
        soil_moisture_pct: norm.draft.soil_water_content_pct,
        soil_temp_f: norm.draft.soil_temp_f,
        co2_ppm: norm.draft.co2_ppm,
      })
        .filter(([, v]) => typeof v === "number")
        .map(([k]) => k)
    : [];

  const evidence = buildEcowittIngestEvidence({
    payload,
    draft: norm.draft,
    topic: env.mqttTopic,
    receivedAt,
  });

  const cannotPost = flags.dryRun || !norm.ok || !env.url || !env.token || !env.tentId;

  if (cannotPost) {
    const report = buildIngestAttemptReport({
      url: env.url,
      token: env.token,
      tentId: env.tentId,
      plantId: env.plantId,
      dryRun: true,
      normalizerReasons: norm.reasons,
      metricKeys,
      evidence,
    });
    printReport(report);
    if (flags.writeReport) await writeRedactedReport(report);
    return {
      reasons: [...norm.reasons],
      posted: false,
      classification: report.classification,
      status: report.status,
    };
  }

  const body = {
    tent_id: env.tentId,
    source: "ecowitt",
    captured_at: norm.draft!.captured_at,
    vendor: "ecowitt",
    metrics: Object.fromEntries(
      metricKeys.map((k) => {
        const draft = norm.draft! as unknown as Record<string, number | null>;
        const fromDraft: Record<string, number | null> = {
          temp_f: draft.air_temp_f,
          humidity_pct: draft.humidity_pct,
          vpd_kpa: draft.vpd_kpa,
          soil_moisture_pct: draft.soil_water_content_pct,
          soil_temp_f: draft.soil_temp_f,
          co2_ppm: draft.co2_ppm,
        };
        return [k, fromDraft[k]];
      }),
    ),
    metadata: {
      transport: "mqtt_local_bridge",
      topic: env.mqttTopic,
      ...(env.plantId ? { plant_id: env.plantId } : {}),
    },
    raw_payload: payload,
  };

  let resp: { status: number; body: string } | null = null;
  let networkError: string | null = null;
  try {
    const r = await fetchImpl(env.url!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.token}`,
        "Idempotency-Key": `ecowitt-mqtt-${norm.draft!.captured_at}`,
      },
      body: JSON.stringify(body),
    });
    resp = { status: r.status, body: await r.text() };
  } catch (e) {
    networkError = e instanceof Error ? e.message : String(e);
  }

  const report = buildIngestAttemptReport({
    url: env.url,
    token: env.token,
    tentId: env.tentId,
    plantId: env.plantId,
    response: resp,
    networkError,
    normalizerReasons: norm.reasons,
    metricKeys,
    evidence,
  });
  printReport(report);
  if (flags.writeReport) await writeRedactedReport(report);

  return {
    reasons: [...norm.reasons],
    posted: resp !== null,
    classification: report.classification,
    status: report.status,
  };
}

async function writeRedactedReport(
  report: ReturnType<typeof buildIngestAttemptReport>,
): Promise<void> {
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const out = path.resolve(DEFAULT_REPORT_PATH);
    await mkdir(path.dirname(out), { recursive: true });
    const payload = buildRedactedReportJson(report);
    await writeFile(out, JSON.stringify(payload, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.log(
      "[ecowitt-mqtt-runner] redacted report written to",
      out,
      "— paste into /operator/ecowitt-bridge-status",
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ecowitt-mqtt-runner] could not write redacted report:", e);
  }
}

export function buildRedactedReportJson(
  report: ReturnType<typeof buildIngestAttemptReport>,
): Record<string, unknown> {
  return {
    status: report.status,
    classification: report.classification,
    http_status: report.httpStatus,
    reasons: report.reasons,
    url: report.url,
    tent_id: report.tentId,
    plant_id: report.plantId,
    metric_keys: report.metricKeys,
    auth: report.authPreview,
    transport: report.evidence?.transport ?? "mqtt_local_bridge",
    topic: report.evidence?.topic ?? "ecowitt/grow",
    evidence: report.evidence,
    note: report.storageNotice,
  };
}

function printReport(report: ReturnType<typeof buildIngestAttemptReport>): void {
  const e = report.evidence;
  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] consumed MQTT message", {
    title: report.title,
    status: report.status,
    classification: report.classification,
    http: report.httpStatus,
    auth: report.authPreview,
    tent: report.tentId,
    payload_kind: e?.payload_kind ?? "unknown",
    provider: e?.provider ?? "unknown",
    topic: e?.topic ?? null,
    received_at: e?.received_at ?? null,
    dateutc: e?.dateutc ?? null,
    raw_keys_redacted: e?.raw_keys_redacted ?? [],
    canonical_metrics: e?.canonical_metrics ?? report.metricKeys,
    missing_metrics: e?.missing_metrics ?? [],
    passkey_redacted: e?.redactions.passkey_redacted ?? false,
    reasons: report.reasons,
    note: report.storageNotice,
  });
}

// ---------------------------------------------------------------------------
// MQTT wiring
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function connectMqttClient(env: RuntimeEnv): Promise<any> {
  // Dynamic require so dry-run / sample modes do not require the `mqtt`
  // package to be installed and TypeScript does not need types for it
  // at build time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mqtt: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mqtt = await (Function("m", "return import(m)") as any)("mqtt");
  } catch {
    // eslint-disable-next-line no-console
    console.error(
      "[ecowitt-mqtt-runner] mqtt package not installed. Run `bun add mqtt` or use --dry-run --sample.",
    );
    process.exit(2);
  }
  return mqtt.connect(env.mqttUrl, {
    username: env.mqttUsername ?? undefined,
    password: env.mqttPassword ?? undefined,
    reconnectPeriod: 5000,
  });
}

export function haSubscribeTopic(config: RunnerModeConfig, env: RuntimeEnv): string {
  if (config.upstreamMode === "ha_statestream") {
    const prefix = (config.mapping?.statestream_topic_prefix ?? "").replace(/\/+$/, "");
    return `${prefix}/#`;
  }
  return env.mqttTopic;
}

async function runHaDryRunLoop(
  config: RunnerModeConfig,
  env: RuntimeEnv,
  flags: CliFlags,
): Promise<void> {
  if (flags.sample || flags.invalid) {
    // eslint-disable-next-line no-console
    console.error(
      "[ecowitt-mqtt-runner] --sample/--invalid build raw EcoWitt payloads and are ecowitt_raw-only. Refusing to start (fail closed).",
    );
    process.exit(2);
    return;
  }
  if (flags.writeReport) {
    // eslint-disable-next-line no-console
    console.log(
      "[ecowitt-mqtt-runner] --write-report is ecowitt_raw-only; HA dry-run evidence is printed to stdout instead.",
    );
  }
  const haState = createHaDryRunState(config);
  const topic = haSubscribeTopic(config, env);
  const client = await connectMqttClient(env);
  client.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-mqtt-runner] subscribed (ha dry-run)", topic);
    client.subscribe(topic);
  });
  client.on(
    "message",
    async (msgTopic: string, buf: Buffer, packet?: { retain?: boolean }) => {
      const outcome = await handleIncomingMqttMessage({
        topic: msgTopic,
        payloadText: buf.toString("utf8"),
        retained: packet?.retain === true,
        config,
        env,
        flags,
        haState,
      });
      if (
        flags.once &&
        outcome.kind === "ha_dry_run" &&
        (outcome.report.outcome === "reading" || outcome.report.outcome === "rejected")
      ) {
        client.end();
        process.exit(0);
      }
    },
  );
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const env = readEnv(process.env);

  let modeConfig: RunnerModeConfig;
  try {
    modeConfig = resolveRunnerModeConfig(process.env);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[ecowitt-mqtt-runner] configuration error — refusing to start (fail closed):",
      e instanceof Error ? e.message : String(e),
    );
    process.exit(2);
    return;
  }

  if (modeConfig.upstreamMode !== "ecowitt_raw") {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-mqtt-runner] startup", {
      upstream_mode: modeConfig.upstreamMode,
      mapping_path: modeConfig.mappingPath,
      dryRun: true,
      once: flags.once,
      broker: env.mqttUrl,
      subscribe_topic: haSubscribeTopic(modeConfig, env),
      posture: "dry-run only — HA adapter modes never POST, never store, never control devices",
    });
    await runHaDryRunLoop(modeConfig, env, flags);
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] startup", {
    upstream_mode: modeConfig.upstreamMode,
    dryRun: flags.dryRun,
    once: flags.once,
    sample: flags.sample,
    invalid: flags.invalid,
    topic: env.mqttTopic,
    broker: env.mqttUrl,
    url: env.url ?? "(none — dry-run only)",
    auth: redactBridgeToken(env.token),
    tent: env.tentId ?? "(none)",
  });

  if (flags.sample || flags.invalid) {
    await handlePayload(buildSamplePayload(flags.invalid), env, flags);
    if (flags.once || flags.dryRun) return;
  }

  // NOTE: dry-run without --sample now subscribes to MQTT and consumes a
  // real message so the dry-run report reflects actual gateway evidence
  // rather than a built-in sample payload.

  const client = await connectMqttClient(env);

  client.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-mqtt-runner] subscribed", env.mqttTopic);
    client.subscribe(env.mqttTopic);
  });

  client.on("message", async (topic: string, buf: Buffer) => {
    const outcome = await handleIncomingMqttMessage({
      topic,
      payloadText: buf.toString("utf8"),
      retained: false,
      config: modeConfig,
      env,
      flags,
      haState: null,
    });
    if (flags.once && outcome.kind === "ecowitt_raw" && outcome.parsed) {
      client.end();
      process.exit(0);
    }
  });
}

// Export internals for tests; run main only when invoked directly.
export { handlePayload };

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].includes("ecowitt-mqtt-runner");

if (invokedDirectly) {
  void main();
}

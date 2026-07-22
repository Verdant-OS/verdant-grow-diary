#!/usr/bin/env -S bun run
/**
 * Local EcoWitt / Home Assistant MQTT → Verdant ingest runner.
 *
 * Routes:
 *   - No HA_MQTT_MAPPING_PATH: existing ecowitt2mqtt aggregate payload path.
 *   - HA_MQTT_MAPPING_PATH set: adapter_mode, mqtt_topic, and upstream_mode are
 *     loaded from that versioned config. Topic shape is never used for routing.
 *
 * Home Assistant routes are intentionally dry-run-only in this slice.
 *
 * Safety rules:
 *   - No Supabase SDK import. No direct DB writes. No service_role.
 *   - No device control. No Action Queue writes. No automation.
 *   - Bridge tokens are NEVER logged in plaintext.
 *   - HA JSON / Statestream routes cannot POST to the ingest webhook.
 *   - Stale / invalid telemetry is never promoted to live.
 *
 * Flags:
 *   --dry-run      Normalize + report only. No network call.
 *   --once         Exit after the next complete adapter result.
 *   --sample       Built-in fresh EcoWitt sample (raw route only).
 *   --invalid      Built-in impossible EcoWitt sample (raw route only).
 *   --write-report Write the latest redacted report under ./tmp.
 *
 * Env:
 *   VERDANT_INGEST_URL    (raw live POST only)
 *   VERDANT_BRIDGE_TOKEN  (raw live POST only)
 *   VERDANT_TENT_ID       (raw route)
 *   VERDANT_PLANT_ID      (raw route, optional)
 *   ECOWITT_MQTT_URL      (default mqtt://127.0.0.1:1883)
 *   ECOWITT_MQTT_TOPIC    (default ecowitt/grow; raw route only)
 *   ECOWITT_MQTT_USERNAME (optional)
 *   ECOWITT_MQTT_PASSWORD (optional)
 *   HA_MQTT_MAPPING_PATH  (enables config-routed HA dry-run mode)
 */

import { redactBridgeToken } from "../../src/lib/ecowittLocalTestPayloadRules";
import {
  buildEcowittIngestEvidence,
  normalizeEcowittMqttPayload,
  type EcowittMqttPayload,
} from "../../src/lib/ecowittMqttIngestRules";
import { buildIngestAttemptReport } from "../../src/lib/ingestAttemptReportRules";
import {
  HaMqttDryRunPipeline,
  configuredAdapterMode,
  configuredSubscriptionTopic,
  parseHaMqttRunnerConfig,
  type HaMqttRunnerConfig,
  type HaRunnerDryRunOutcome,
  type RunnerMqttMessage,
} from "../../src/lib/homeAssistantMqttRunnerRules";

export const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";
export const DEFAULT_MQTT_TOPIC = "ecowitt/grow";
export const DEFAULT_REPORT_PATH = "./tmp/ecowitt-last-ingest-report.json";

export interface CliFlags {
  dryRun: boolean;
  once: boolean;
  sample: boolean;
  invalid: boolean;
  writeReport?: boolean;
}

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
  haMappingPath?: string | null;
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
    haMappingPath: env.HA_MQTT_MAPPING_PATH ?? null,
  };
}

export async function loadHaMqttRunnerConfig(
  mappingPath: string | null | undefined,
): Promise<HaMqttRunnerConfig> {
  if (!mappingPath) {
    throw new Error("HA_MQTT_MAPPING_PATH is required for Home Assistant mode");
  }
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const resolved = path.resolve(mappingPath);
  try {
    const raw = JSON.parse(await readFile(resolved, "utf8")) as unknown;
    return parseHaMqttRunnerConfig(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load HA MQTT mapping at ${resolved}: ${message}`);
  }
}

export function createHaDryRunPipeline(
  config: HaMqttRunnerConfig,
): HaMqttDryRunPipeline {
  return new HaMqttDryRunPipeline(config);
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

export interface HandleResult {
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
        .filter(([, value]) => typeof value === "number")
        .map(([key]) => key)
    : [];

  const evidence = buildEcowittIngestEvidence({
    payload,
    draft: norm.draft,
    topic: env.mqttTopic,
    receivedAt,
  });

  const cannotPost =
    flags.dryRun || !norm.ok || !env.url || !env.token || !env.tentId;

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
      metricKeys.map((key) => {
        const draft = norm.draft! as unknown as Record<string, number | null>;
        const fromDraft: Record<string, number | null> = {
          temp_f: draft.air_temp_f,
          humidity_pct: draft.humidity_pct,
          vpd_kpa: draft.vpd_kpa,
          soil_moisture_pct: draft.soil_water_content_pct,
          soil_temp_f: draft.soil_temp_f,
          co2_ppm: draft.co2_ppm,
        };
        return [key, fromDraft[key]];
      }),
    ),
    metadata: {
      transport: "mqtt_local_bridge",
      topic: env.mqttTopic,
      ...(env.plantId ? { plant_id: env.plantId } : {}),
    },
    raw_payload: payload,
  };

  let response: { status: number; body: string } | null = null;
  let networkError: string | null = null;
  try {
    const result = await fetchImpl(env.url!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.token}`,
        "Idempotency-Key": `ecowitt-mqtt-${norm.draft!.captured_at}`,
      },
      body: JSON.stringify(body),
    });
    response = { status: result.status, body: await result.text() };
  } catch (error) {
    networkError = error instanceof Error ? error.message : String(error);
  }

  const report = buildIngestAttemptReport({
    url: env.url,
    token: env.token,
    tentId: env.tentId,
    plantId: env.plantId,
    response,
    networkError,
    normalizerReasons: norm.reasons,
    metricKeys,
    evidence,
  });
  printReport(report);
  if (flags.writeReport) await writeRedactedReport(report);

  return {
    reasons: [...norm.reasons],
    posted: response !== null,
    classification: report.classification,
    status: report.status,
  };
}

export interface HaDryRunReport {
  status: "dry_run";
  pipeline_status: HaRunnerDryRunOutcome["status"];
  adapter: "ha_json" | "ha_statestream";
  classification: string;
  ok: boolean;
  posted: false;
  reasons: string[];
  provider: string | null;
  transport: string | null;
  bridge: string | null;
  upstream_mode: string;
  topic: string | null;
  retained: boolean | null;
  captured_at: string | null;
  received_at: string | null;
  broker_received_at: string | null;
  tent_id: string | null;
  plant_id: string | null;
  confidence: number;
  mapping_path: string | null;
  readings: Array<{
    metric: string;
    value: number;
    tent_id: string;
    plant_id: string | null;
    captured_at: string;
    idempotency_key: string;
  }>;
  note: string;
}

export interface HaMessageHandleResult extends HandleResult {
  pipelineStatus: HaRunnerDryRunOutcome["status"];
  report: HaDryRunReport | null;
}

export async function handleHaDryRunMessage(args: {
  pipeline: HaMqttDryRunPipeline;
  config: HaMqttRunnerConfig;
  mappingPath?: string | null;
  message: RunnerMqttMessage;
  flags: CliFlags;
}): Promise<HaMessageHandleResult> {
  if (!args.flags.dryRun) {
    return {
      reasons: ["ha_adapter_dry_run_required"],
      posted: false,
      classification: "invalid",
      status: "blocked",
      pipelineStatus: "ignored",
      report: null,
    };
  }

  const outcome = args.pipeline.consume(args.message);
  if (outcome.status !== "processed" || !outcome.result) {
    printHaPending(outcome);
    return {
      reasons: [...outcome.reasons],
      posted: false,
      classification: outcome.status,
      status: "dry_run",
      pipelineStatus: outcome.status,
      report: null,
    };
  }

  const report = buildHaDryRunReport({
    config: args.config,
    outcome,
    mappingPath: args.mappingPath ?? null,
  });
  printHaDryRunReport(report);
  if (args.flags.writeReport) await writeRedactedJsonReport(report);
  return {
    reasons: [...outcome.reasons],
    posted: false,
    classification: report.classification,
    status: "dry_run",
    pipelineStatus: outcome.status,
    report,
  };
}

export function buildHaDryRunReport(args: {
  config: HaMqttRunnerConfig;
  outcome: HaRunnerDryRunOutcome;
  mappingPath: string | null;
}): HaDryRunReport {
  const result = args.outcome.result;
  if (!result) {
    throw new Error("Cannot build HA dry-run report without an adapter result");
  }
  const provenance = result.provenance;
  return {
    status: "dry_run",
    pipeline_status: args.outcome.status,
    adapter: args.config.adapter_mode,
    classification: provenance.source,
    ok: result.ok,
    posted: false,
    reasons: [...args.outcome.reasons],
    provider: provenance.provider,
    transport: provenance.transport,
    bridge: provenance.bridge,
    upstream_mode: args.config.upstream_mode,
    topic: provenance.topic,
    retained: provenance.retained,
    captured_at: provenance.captured_at,
    received_at: provenance.received_at,
    broker_received_at: provenance.broker_received_at,
    tent_id: provenance.tent_id,
    plant_id: provenance.plant_id,
    confidence: provenance.confidence,
    mapping_path: args.mappingPath,
    readings: result.readings.map((reading) => ({
      metric: reading.metric,
      value: reading.value,
      tent_id: reading.tent_id,
      plant_id: reading.plant_id,
      captured_at: reading.captured_at,
      idempotency_key: reading.idempotency_key,
    })),
    note: "Nothing was sent or stored. Home Assistant adapter modes are dry-run-only.",
  };
}

function printHaDryRunReport(report: HaDryRunReport): void {
  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] Home Assistant dry-run", report);
}

function printHaPending(outcome: HaRunnerDryRunOutcome): void {
  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] Home Assistant message pending", {
    status: outcome.status,
    adapter: outcome.adapter_mode,
    entity_id: outcome.entity_id,
    retained: outcome.retained,
    reasons: outcome.reasons,
    note: "Nothing was sent or stored.",
  });
}

async function writeRedactedReport(
  report: ReturnType<typeof buildIngestAttemptReport>,
): Promise<void> {
  await writeRedactedJsonReport(buildRedactedReportJson(report));
}

async function writeRedactedJsonReport(payload: unknown): Promise<void> {
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const output = path.resolve(DEFAULT_REPORT_PATH);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(payload, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.log(
      "[ecowitt-mqtt-runner] redacted report written to",
      output,
      "— paste into /operator/ecowitt-bridge-status",
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ecowitt-mqtt-runner] could not write redacted report:",
      error,
    );
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
  const evidence = report.evidence;
  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] consumed MQTT message", {
    title: report.title,
    status: report.status,
    classification: report.classification,
    http: report.httpStatus,
    auth: report.authPreview,
    tent: report.tentId,
    payload_kind: evidence?.payload_kind ?? "unknown",
    provider: evidence?.provider ?? "unknown",
    topic: evidence?.topic ?? null,
    received_at: evidence?.received_at ?? null,
    dateutc: evidence?.dateutc ?? null,
    raw_keys_redacted: evidence?.raw_keys_redacted ?? [],
    canonical_metrics: evidence?.canonical_metrics ?? report.metricKeys,
    missing_metrics: evidence?.missing_metrics ?? [],
    passkey_redacted: evidence?.redactions.passkey_redacted ?? false,
    reasons: report.reasons,
    note: report.storageNotice,
  });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const env = readEnv(process.env);

  let haConfig: HaMqttRunnerConfig | null = null;
  let haPipeline: HaMqttDryRunPipeline | null = null;
  if (env.haMappingPath) {
    try {
      haConfig = await loadHaMqttRunnerConfig(env.haMappingPath);
      haPipeline = createHaDryRunPipeline(haConfig);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        "[ecowitt-mqtt-runner] HA mapping error:",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(2);
      return;
    }
    if (!flags.dryRun) {
      // eslint-disable-next-line no-console
      console.error(
        "[ecowitt-mqtt-runner] HA adapter routes are dry-run-only. Add --dry-run.",
      );
      process.exit(2);
      return;
    }
    if (flags.sample || flags.invalid) {
      // eslint-disable-next-line no-console
      console.error(
        "[ecowitt-mqtt-runner] --sample and --invalid are raw-route flags only.",
      );
      process.exit(2);
      return;
    }
  }

  const adapter = haConfig ? configuredAdapterMode(haConfig) : "ecowitt_raw";
  const subscriptionTopic = haConfig
    ? configuredSubscriptionTopic(haConfig)
    : env.mqttTopic;

  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] startup", {
    adapter,
    upstream_mode: haConfig?.upstream_mode ?? "ecowitt_custom_upload",
    dryRun: flags.dryRun,
    once: flags.once,
    sample: flags.sample,
    invalid: flags.invalid,
    topic: subscriptionTopic,
    broker: env.mqttUrl,
    mapping: env.haMappingPath ?? "(raw route — no mapping)",
    url: haConfig
      ? "(disabled — HA dry-run only)"
      : env.url ?? "(none — dry-run only)",
    auth: haConfig ? "(not used by HA dry-run)" : redactBridgeToken(env.token),
    tent: haConfig ? "from mapping" : env.tentId ?? "(none)",
  });

  if (!haConfig && (flags.sample || flags.invalid)) {
    await handlePayload(buildSamplePayload(flags.invalid), env, flags);
    if (flags.once || flags.dryRun) return;
  }

  // Dynamic import keeps raw sample-only dry-runs usable without the optional
  // mqtt package and avoids adding MQTT types to the app TypeScript config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mqtt: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mqtt = await (Function("moduleName", "return import(moduleName)") as any)(
      "mqtt",
    );
  } catch {
    // eslint-disable-next-line no-console
    console.error(
      "[ecowitt-mqtt-runner] mqtt package not installed. Run `bun add mqtt` or use raw --dry-run --sample.",
    );
    process.exit(2);
    return;
  }

  const client = mqtt.connect(env.mqttUrl, {
    username: env.mqttUsername ?? undefined,
    password: env.mqttPassword ?? undefined,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-mqtt-runner] subscribed", subscriptionTopic);
    client.subscribe(subscriptionTopic);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.on("message", async (topic: string, buffer: Buffer, packet: any) => {
    const receivedAt = new Date();
    const retained = packet?.retain === true;

    if (!haConfig || !haPipeline) {
      let payload: EcowittMqttPayload;
      try {
        payload = JSON.parse(buffer.toString("utf8")) as EcowittMqttPayload;
      } catch {
        const report = buildIngestAttemptReport({
          url: env.url,
          token: env.token,
          dryRun: true,
          normalizerReasons: ["malformed_payload"],
        });
        printReport(report);
        return;
      }
      await handlePayload(payload, env, flags, fetch, receivedAt);
      if (flags.once) {
        client.end();
        process.exit(0);
      }
      return;
    }

    const handled = await handleHaDryRunMessage({
      pipeline: haPipeline,
      config: haConfig,
      mappingPath: env.haMappingPath,
      message: {
        topic,
        payload: buffer.toString("utf8"),
        retained,
        receivedAt,
        brokerReceivedAt: receivedAt,
        now: receivedAt,
      },
      flags,
    });
    if (flags.once && handled.pipelineStatus === "processed") {
      client.end();
      process.exit(0);
    }
  });
}

// Export raw internals for existing tests; run main only when invoked directly.
export { handlePayload };

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].includes("ecowitt-mqtt-runner");

if (invokedDirectly) {
  void main();
}

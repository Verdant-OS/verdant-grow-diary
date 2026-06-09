#!/usr/bin/env -S bun run
/**
 * Local EcoWitt MQTT → Verdant ingest runner.
 *
 * Subscribes to a local MQTT broker (default mqtt://127.0.0.1:1883,
 * topic `ecowitt/grow`), normalizes each EcoWitt JSON payload, builds
 * the canonical webhook payload, and POSTs to the existing validated
 * `sensor-ingest-webhook` Edge Function.
 *
 * Safety rules:
 *   - No Supabase SDK import. No direct DB writes. No service_role.
 *   - No device control. No Action Queue writes. No automation.
 *   - Bridge tokens are NEVER logged in plaintext.
 *   - Stale / invalid payloads are reported and never POSTed as live.
 *
 * Flags:
 *   --dry-run    Normalize + report only. No network call.
 *   --once       Process the next single message (or sample) then exit.
 *   --sample     Use a built-in fresh sample payload (no MQTT needed).
 *   --invalid    Use a built-in impossible sample payload (no MQTT needed).
 *
 * Env:
 *   VERDANT_INGEST_URL   (required for live POST)
 *   VERDANT_BRIDGE_TOKEN (required for live POST)
 *   VERDANT_TENT_ID      (required)
 *   VERDANT_PLANT_ID     (optional, metadata only)
 *   ECOWITT_MQTT_URL     (default mqtt://127.0.0.1:1883)
 *   ECOWITT_MQTT_TOPIC   (default ecowitt/grow)
 *   ECOWITT_MQTT_USERNAME (optional)
 *   ECOWITT_MQTT_PASSWORD (optional)
 */

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
    const payload = {
      status: report.status,
      classification: report.classification,
      http_status: report.httpStatus,
      reasons: report.reasons,
      url: report.url,
      tent_id: report.tentId,
      plant_id: report.plantId,
      metric_keys: report.metricKeys,
      auth: report.authPreview,
      transport: "mqtt_local_bridge",
      topic: "ecowitt/grow",
      note: report.storageNotice,
    };
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

function printReport(report: ReturnType<typeof buildIngestAttemptReport>): void {
  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner]", {
    title: report.title,
    status: report.status,
    classification: report.classification,
    http: report.httpStatus,
    auth: report.authPreview,
    tent: report.tentId,
    metrics: report.metricKeys,
    reasons: report.reasons,
    note: report.storageNotice,
  });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const env = readEnv(process.env);

  // eslint-disable-next-line no-console
  console.log("[ecowitt-mqtt-runner] startup", {
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

  if (flags.dryRun && !(flags.sample || flags.invalid)) {
    await handlePayload(buildSamplePayload(false), env, flags);
    return;
  }

  // Live MQTT path — dynamic require so dry-run / sample modes do not
  // require the `mqtt` package to be installed and TypeScript does not
  // need types for it at build time.
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

  const client = mqtt.connect(env.mqttUrl, {
    username: env.mqttUsername ?? undefined,
    password: env.mqttPassword ?? undefined,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-mqtt-runner] subscribed", env.mqttTopic);
    client.subscribe(env.mqttTopic);
  });

  client.on("message", async (_topic: string, buf: Buffer) => {
    let payload: EcowittMqttPayload;
    try {
      payload = JSON.parse(buf.toString("utf8")) as EcowittMqttPayload;
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
    await handlePayload(payload, env, flags);
    if (flags.once) {
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

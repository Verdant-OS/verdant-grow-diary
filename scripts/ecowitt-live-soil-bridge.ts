#!/usr/bin/env -S bun run
/**
 * EcoWitt Live Soil Bridge
 * ------------------------
 * Subscribes to a local Mosquitto topic where `ecowitt2mqtt` publishes
 * EcoWitt gateway readings. Normalizes them with the pure rules in
 * `src/lib/ecowittLiveSoilIngestRules.ts` and forwards accepted readings
 * to the existing Verdant `sensor-ingest-webhook` Edge Function.
 *
 * SAFETY:
 *   - No direct Supabase usage.
 *   - No service_role usage.
 *   - No device control. No automation. No Action Queue writes.
 *   - Invalid telemetry is dropped or logged as invalid — never forwarded
 *     as healthy live data.
 *   - Bridge token is never logged in clear text.
 *   - Raw EcoWitt PASSKEY / MAC / tokens are redacted before logging
 *     and before being forwarded inside `raw_payload`.
 *
 * Env vars:
 *   ECOWITT_MQTT_URL              Full URL (mqtt://host:1883) OR
 *   ECOWITT_MQTT_HOST + ECOWITT_MQTT_PORT
 *   ECOWITT_MQTT_USERNAME         optional
 *   ECOWITT_MQTT_PASSWORD         optional
 *   ECOWITT_MQTT_TOPIC            default: ecowitt/grow
 *   VERDANT_INGEST_URL            required when not dry-run
 *   VERDANT_BRIDGE_TOKEN          required when not dry-run
 *   VERDANT_TENT_ID               fallback tent for air/environment metrics
 *   VERDANT_PLANT_ID              optional fallback plant id
 *   ECOWITT_SOIL_CHANNEL_MAP_JSON optional channel map (see docs)
 *   ECOWITT_BRIDGE_DRY_RUN        "1" to force dry-run (alias for --dry-run)
 *
 * Flags:
 *   --dry-run   parse + normalize + log, never POST
 */

import {
  normalizeEcowittLiveSoilPayload,
  parseEcowittSoilChannelMap,
  redactForLog,
  maskBridgeToken,
  fullJitterBackoffMs,
  type CanonicalWebhookPayload,
  type EcowittSoilChannelMap,
} from "../src/lib/ecowittLiveSoilIngestRules";

// ---------- Pure bridge orchestration (testable, no I/O) ----------

export interface BridgeEnv {
  ingestUrl: string | null;
  bridgeToken: string | null;
  defaultTentId: string | null;
  defaultPlantId: string | null;
  channelMap: EcowittSoilChannelMap;
  dryRun: boolean;
}

export function readBridgeEnv(env: NodeJS.ProcessEnv, argv: string[]): BridgeEnv {
  const dryRun =
    argv.includes("--dry-run") || env.ECOWITT_BRIDGE_DRY_RUN === "1";
  return {
    ingestUrl: env.VERDANT_INGEST_URL ?? null,
    bridgeToken: env.VERDANT_BRIDGE_TOKEN ?? null,
    defaultTentId: env.VERDANT_TENT_ID ?? null,
    defaultPlantId: env.VERDANT_PLANT_ID ?? null,
    channelMap: parseEcowittSoilChannelMap(env.ECOWITT_SOIL_CHANNEL_MAP_JSON),
    dryRun,
  };
}

export interface HandleMessageDeps {
  env: BridgeEnv;
  /** Forwarder injected so tests can assert without network. */
  forward: (p: CanonicalWebhookPayload) => Promise<{ ok: boolean; status: number }>;
  log: (level: "info" | "warn" | "error", msg: string, extra?: unknown) => void;
  now?: Date;
  soilHistory?: Map<string, number[]>;
}

export interface HandleMessageResult {
  accepted: number;
  rejected: number;
  reasons: string[];
}

/**
 * Pure orchestration step: takes a single raw MQTT message body (string)
 * and the bridge environment, runs the normalizer, and (when not dry-run)
 * invokes `forward` for each accepted payload.
 */
export async function handleMqttMessage(
  raw: string,
  deps: HandleMessageDeps,
): Promise<HandleMessageResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    deps.log("warn", "malformed_json_message");
    return { accepted: 0, rejected: 1, reasons: ["malformed_payload"] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    deps.log("warn", "non_object_payload");
    return { accepted: 0, rejected: 1, reasons: ["malformed_payload"] };
  }

  const result = normalizeEcowittLiveSoilPayload({
    payload: parsed as Record<string, unknown>,
    defaultTentId: deps.env.defaultTentId,
    defaultPlantId: deps.env.defaultPlantId,
    soilChannelMap: deps.env.channelMap,
    recentSoilHistory: deps.soilHistory,
    now: deps.now,
  });

  if (result.payloads.length === 0) {
    deps.log("warn", "no_payloads", {
      reasons: result.reasons,
      chips: result.chips,
      preview: redactForLog(parsed),
    });
    return { accepted: 0, rejected: 1, reasons: result.reasons };
  }

  if (deps.env.dryRun) {
    for (const p of result.payloads) {
      deps.log("info", "dry_run_payload", {
        tent_id: p.tent_id,
        captured_at: p.captured_at,
        metrics: p.metrics,
        metadata: p.metadata,
      });
    }
    return { accepted: result.payloads.length, rejected: 0, reasons: result.reasons };
  }

  let accepted = 0;
  let rejected = 0;
  for (const p of result.payloads) {
    try {
      const r = await deps.forward(p);
      if (r.ok) {
        accepted += 1;
        deps.log("info", "forwarded", { status: r.status, tent_id: p.tent_id });
      } else {
        rejected += 1;
        deps.log("warn", "forward_rejected", { status: r.status, tent_id: p.tent_id });
      }
    } catch (e) {
      rejected += 1;
      deps.log("error", "forward_error", { message: (e as Error).message });
    }
  }
  return { accepted, rejected, reasons: result.reasons };
}

/**
 * POST one canonical payload to the Verdant ingest webhook with
 * Full-Jitter exponential backoff. Returns ok=true on 2xx. Never throws
 * on retryable network errors; throws only if all retries are exhausted.
 */
export async function forwardWithBackoff(
  payload: CanonicalWebhookPayload,
  opts: {
    url: string;
    bridgeToken: string;
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<void>;
    maxAttempts?: number;
    timeoutMs?: number;
    random?: () => number;
  },
): Promise<{ ok: boolean; status: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleepImpl = opts.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxAttempts = opts.maxAttempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 12_000;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(opts.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.bridgeToken}`,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, status: res.status };
      }
      // 4xx (other than 429) — do not retry, payload is bad.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, status: res.status };
      }
      lastErr = new Error(`upstream_${res.status}`);
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
    if (attempt < maxAttempts - 1) {
      await sleepImpl(fullJitterBackoffMs(attempt, { random: opts.random }));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("forward_failed");
}

// ---------- CLI entry (only runs when executed directly) ----------

// Bun: import.meta.main === true when run as script.
// Node: require.main === module. We guard with a lightweight check.
const isMain =
  typeof (import.meta as unknown as { main?: boolean }).main === "boolean"
    ? (import.meta as unknown as { main?: boolean }).main === true
    : false;

if (isMain) {
  const env = readBridgeEnv(process.env, process.argv);
  const log = (level: "info" | "warn" | "error", msg: string, extra?: unknown) => {
    // eslint-disable-next-line no-console
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (extra === undefined) fn(`[ecowitt-bridge] ${msg}`);
    else fn(`[ecowitt-bridge] ${msg}`, redactForLog(extra));
  };

  if (!env.dryRun) {
    if (!env.ingestUrl) {
      log("error", "missing VERDANT_INGEST_URL");
      process.exit(2);
    }
    if (!env.bridgeToken) {
      log("error", "missing VERDANT_BRIDGE_TOKEN");
      process.exit(2);
    }
  }
  log("info", "starting", {
    dryRun: env.dryRun,
    topic: process.env.ECOWITT_MQTT_TOPIC ?? "ecowitt/grow",
    ingestUrl: env.ingestUrl,
    bridgeAuth: maskBridgeToken(env.bridgeToken),
    defaultTentId: env.defaultTentId,
    channels: Object.keys(env.channelMap),
  });

  // Dynamic import keeps the script importable in test environments
  // where `mqtt` is not installed. Operators install `mqtt` locally
  // (the bridge runs on the operator's LAN, not in the web app).
  interface MqttLike {
    connect: (url: string, opts: Record<string, unknown>) => {
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      subscribe: (topic: string, cb: (err: Error | null) => void) => void;
    };
  }
  let mqttMod: MqttLike;
  try {
    const modName = ["m", "q", "t", "t"].join("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mqttMod = (await import(/* @vite-ignore */ modName)) as MqttLike;
  } catch {
    log("error", "mqtt package not installed — run `bun add mqtt` locally");
    process.exit(2);
  }

  const url =
    process.env.ECOWITT_MQTT_URL ??
    `mqtt://${process.env.ECOWITT_MQTT_HOST ?? "127.0.0.1"}:${process.env.ECOWITT_MQTT_PORT ?? "1883"}`;
  const topic = process.env.ECOWITT_MQTT_TOPIC ?? "ecowitt/grow";

  const client = mqttMod.connect(url, {
    username: process.env.ECOWITT_MQTT_USERNAME,
    password: process.env.ECOWITT_MQTT_PASSWORD,
    reconnectPeriod: 5_000,
  });

  const soilHistory = new Map<string, number[]>();

  client.on("connect", () => {
    log("info", "mqtt_connected", { url, topic });
    client.subscribe(topic, (err: Error | null) => {
      if (err) log("error", "mqtt_subscribe_failed", { message: err.message });
    });
  });
  client.on("error", (err: unknown) =>
    log("error", "mqtt_error", { message: (err as Error)?.message ?? String(err) }),
  );
  client.on("message", async (...args: unknown[]) => {
    const msg = args[1] as { toString: (enc: string) => string };
    await handleMqttMessage(msg.toString("utf8"), {
      env,
      forward: (p) =>
        forwardWithBackoff(p, {
          url: env.ingestUrl!,
          bridgeToken: env.bridgeToken!,
        }),
      log,
      soilHistory,
    });
  });
}

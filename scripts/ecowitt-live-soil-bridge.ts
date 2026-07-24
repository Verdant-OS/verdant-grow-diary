// shebang stripped for vitest compatibility — run with: bun run scripts/ecowitt-live-soil-bridge.ts
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
 *   - No elevated service-role key usage.
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
 *   ECOWITT_BRIDGE_VALIDATE_CONFIG "1" to force config-validation-only mode
 *                                 (alias for --validate-config)
 *   ECOWITT_BRIDGE_JSON_ERRORS    "1" for JSON-only validate-config output
 *                                 (alias for --format json / --json-errors)
 *
 * Flags:
 *   --dry-run                    parse + normalize + log, never POST
 *   --validate-config             check the channel map against
 *                                 VERDANT_TENT_ID and exit — never connects
 *                                 to MQTT, never forwards.
 *   --format json / --json-errors with --validate-config, print only a
 *                                 single-line JSON envelope to stdout (no
 *                                 other log lines) — for scripting.
 *
 * --validate-config exit codes (stable, safe to branch on in automation):
 *   0  accepted — channel map (if any) matches VERDANT_TENT_ID
 *   0  empty    — no channel map configured
 *   3  mixed-tent      — a channel names a different tent than VERDANT_TENT_ID
 *   4  malformed_config — ECOWITT_SOIL_CHANNEL_MAP_JSON is set but not valid JSON
 */

import {
  normalizeEcowittLiveSoilPayload,
  parseEcowittSoilChannelMap,
  classifyEcowittChannelMapJsonInput,
  validateChannelMapSingleTent,
  redactForLog,
  maskBridgeToken,
  fullJitterBackoffMs,
  type CanonicalWebhookPayload,
  type EcowittSoilChannelMap,
  type EcowittChannelMapJsonInputState,
  type ChannelMapTentStatus,
} from "../src/lib/ecowittLiveSoilIngestRules";

// ---------- Pure bridge orchestration (testable, no I/O) ----------

export interface BridgeEnv {
  ingestUrl: string | null;
  bridgeToken: string | null;
  defaultTentId: string | null;
  defaultPlantId: string | null;
  channelMap: EcowittSoilChannelMap;
  dryRun: boolean;
  /** --validate-config: check the channel map and exit, no MQTT/forward. */
  validateConfig: boolean;
  /** --format json / --json-errors: validate-config prints JSON only. */
  jsonErrors: boolean;
  /** Whether ECOWITT_SOIL_CHANNEL_MAP_JSON was absent, malformed, or parsed —
   * computed from the raw string, independent of parseEcowittSoilChannelMap's
   * fail-safe `{}` return, so a typo doesn't silently read as "empty". */
  channelMapJsonState: EcowittChannelMapJsonInputState;
}

export function readBridgeEnv(env: NodeJS.ProcessEnv, argv: string[]): BridgeEnv {
  const dryRun = argv.includes("--dry-run") || env.ECOWITT_BRIDGE_DRY_RUN === "1";
  const validateConfig =
    argv.includes("--validate-config") || env.ECOWITT_BRIDGE_VALIDATE_CONFIG === "1";
  const jsonErrors =
    argv.includes("--json-errors") ||
    (argv.includes("--format") && argv[argv.indexOf("--format") + 1] === "json") ||
    env.ECOWITT_BRIDGE_JSON_ERRORS === "1";
  return {
    ingestUrl: env.VERDANT_INGEST_URL ?? null,
    bridgeToken: env.VERDANT_BRIDGE_TOKEN ?? null,
    defaultTentId: env.VERDANT_TENT_ID ?? null,
    defaultPlantId: env.VERDANT_PLANT_ID ?? null,
    channelMap: parseEcowittSoilChannelMap(env.ECOWITT_SOIL_CHANNEL_MAP_JSON),
    dryRun,
    validateConfig,
    jsonErrors,
    channelMapJsonState: classifyEcowittChannelMapJsonInput(env.ECOWITT_SOIL_CHANNEL_MAP_JSON),
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

// ---------- Testable orchestration (no real I/O in this section) ----------

export type LogFn = (level: "info" | "warn" | "error", msg: string, extra?: unknown) => void;

export function buildConsoleLog(): LogFn {
  return (level, msg, extra) => {
     
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (extra === undefined) fn(`[ecowitt-bridge] ${msg}`);
    else fn(`[ecowitt-bridge] ${msg}`, redactForLog(extra));
  };
}

export type BridgeConfigStatus = ChannelMapTentStatus | "malformed_config";

/**
 * Stable exit code per status — safe to branch on in automation without
 * parsing stderr. Documented in the file header; changing a mapping here is
 * a breaking change for scripts, not just an internal refactor.
 */
const CONFIG_STATUS_EXIT_CODES: Readonly<Record<BridgeConfigStatus, number>> = {
  accepted: 0,
  empty: 0,
  "mixed-tent": 3,
  malformed_config: 4,
};

export interface ConfigValidationSummary {
  readonly exitCode: number;
  readonly status: BridgeConfigStatus;
  /** Calm, operator-safe summary: counts, channel keys, and a deterministic
   * redacted message — never a tent UUID, never the raw
   * ECOWITT_SOIL_CHANNEL_MAP_JSON value. */
  readonly summary: Record<string, unknown>;
}

/**
 * Build a deterministic, redacted one-line message for a status. Sorted
 * `offendingChannels` (see validateChannelMapSingleTent) means this string
 * is identical for the same logical config regardless of the order channel
 * keys appeared in the source JSON. Never includes a tent id or raw JSON.
 */
function buildConfigValidationMessage(
  status: BridgeConfigStatus,
  result: ReturnType<typeof validateChannelMapSingleTent>,
): string {
  switch (status) {
    case "malformed_config":
      return "ECOWITT_SOIL_CHANNEL_MAP_JSON is set but could not be parsed as a JSON object — check for a syntax error.";
    case "empty":
      return "No channel map configured — air/environment metrics only, via VERDANT_TENT_ID.";
    case "mixed-tent":
      return (
        `Mixed-tent channel map: ${result.offendingChannels.length} of ${result.channelCount} ` +
        `channel(s) disagree with the expected tent (${result.offendingChannels.join(", ")}).`
      );
    case "accepted":
      return `Channel map accepted: ${result.channelCount} channel(s) all match the expected tent.`;
  }
}

/**
 * Build the `--validate-config` report. Pure given `env` — does not import
 * mqtt, does not call fetch/forward, does not touch the network. A
 * malformed ECOWITT_SOIL_CHANNEL_MAP_JSON is checked before the parsed
 * channel map's own accepted/empty/mixed-tent status, so a typo is never
 * silently reported as "empty". See CONFIG_STATUS_EXIT_CODES for the full
 * exit-code contract.
 */
export function buildConfigValidationSummary(env: BridgeEnv): ConfigValidationSummary {
  if (env.channelMapJsonState === "malformed") {
    const status: BridgeConfigStatus = "malformed_config";
    return {
      exitCode: CONFIG_STATUS_EXIT_CODES[status],
      status,
      summary: {
        mode: "validate-config",
        status,
        message: buildConfigValidationMessage(status, {
          status: "empty",
          channelCount: 0,
          distinctTentCount: 0,
          offendingChannels: [],
        }),
      },
    };
  }

  const result = validateChannelMapSingleTent(env.channelMap, env.defaultTentId);
  const status: BridgeConfigStatus = result.status;
  return {
    exitCode: CONFIG_STATUS_EXIT_CODES[status],
    status,
    summary: {
      mode: "validate-config",
      status,
      channelCount: result.channelCount,
      distinctTentCount: result.distinctTentCount,
      offendingChannelCount: result.offendingChannels.length,
      offendingChannels: result.offendingChannels,
      message: buildConfigValidationMessage(status, result),
    },
  };
}

interface MqttLike {
  connect: (
    url: string,
    opts: Record<string, unknown>,
  ) => {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    subscribe: (topic: string, cb: (err: Error | null) => void) => void;
  };
}

/**
 * Connect to the MQTT broker and wire message handling. The only place this
 * module touches `mqtt` or opens a network connection — kept separate from
 * `runBridge` specifically so `--validate-config` mode can be proven, in a
 * test, to never reach this function at all.
 */
export async function connectAndListenMqtt(env: BridgeEnv, log: LogFn): Promise<void> {
  let mqttMod: MqttLike;
  try {
    const modName = ["m", "q", "t", "t"].join("");
    mqttMod = (await import(/* @vite-ignore */ modName)) as MqttLike;
  } catch {
    log("error", "mqtt package not installed — run `bun add mqtt` locally");
    process.exit(2);
    return;
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

export interface RunBridgeDeps {
  log: LogFn;
  /** Injected so tests can prove it is never invoked in validate-config
   * mode (the sole path to mqtt.connect / HTTP forwarding). */
  connectAndListen: (env: BridgeEnv, log: LogFn) => Promise<void>;
  exit: (code: number) => void;
  /** --format json / --json-errors: emit ONLY this single JSON envelope
   * (no other log line) so automation never has to parse stderr text. */
  writeJson: (obj: unknown) => void;
}

/**
 * Testable orchestration shell: all real I/O (MQTT connection,
 * process.exit) is injected via `deps`, so the full branching logic —
 * including config-validation mode and the missing-env-var guards — can run
 * in a test with zero real network access and zero real process
 * termination.
 */
export async function runBridge(env: BridgeEnv, deps: RunBridgeDeps): Promise<void> {
  const { log, connectAndListen, exit, writeJson } = deps;

  if (env.validateConfig) {
    const { exitCode, summary } = buildConfigValidationSummary(env);
    if (env.jsonErrors) {
      writeJson(summary);
    } else {
      log("info", "config_validation", summary);
    }
    exit(exitCode);
    return;
  }

  if (!env.dryRun) {
    if (!env.ingestUrl) {
      log("error", "missing VERDANT_INGEST_URL");
      exit(2);
      return;
    }
    if (!env.bridgeToken) {
      log("error", "missing VERDANT_BRIDGE_TOKEN");
      exit(2);
      return;
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

  await connectAndListen(env, log);
}

// ---------- CLI entry (only runs when executed directly) ----------

// Bun: import.meta.main === true when run as script.
// Node: require.main === module. We guard with a lightweight check.
const isMain =
  typeof (import.meta as unknown as { main?: boolean }).main === "boolean"
    ? (import.meta as unknown as { main?: boolean }).main === true
    : false;

async function runCli(): Promise<void> {
  const env = readBridgeEnv(process.env, process.argv);
  await runBridge(env, {
    log: buildConsoleLog(),
    connectAndListen: connectAndListenMqtt,
    exit: (code: number) => process.exit(code),
     
    writeJson: (obj: unknown) => console.log(JSON.stringify(obj)),
  });
}

if (isMain) {
  void runCli();
}

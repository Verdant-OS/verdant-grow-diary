#!/usr/bin/env -S bun run
/**
 * EcoWitt MQTT → `ecowitt-ingest` forwarder (PC-side dev tool).
 *
 * Purpose:
 *   The HTTP bridge (`ecowitt-http-local-bridge.ts`) republishes each gateway
 *   "Customized upload" onto a local MQTT topic and, by design, never talks to
 *   Verdant. This forwarder is the separate, explicitly gated step that
 *   subscribes to that topic and forwards the raw gateway payload to the
 *   Verdant `ecowitt-ingest` edge function, which routes each channel to the
 *   tent that declares it in `tents.hardware_config.ecowitt` (`air_channels`,
 *   `soil_channels`) and authenticates with a Verdant bridge token.
 *
 * Posture:
 *   - DRY-RUN BY DEFAULT. Without `--live` nothing leaves this machine.
 *   - `--live` fails closed unless ECOWITT_INGEST_URL is an https URL ending
 *     in `/ecowitt-ingest` and VERDANT_BRIDGE_TOKEN has the `vbt_` shape.
 *   - EcoWitt ingest is dry-run only until the gates in
 *     docs/ecowitt-future-real-ingest-gates.md are cleared by the owner.
 *     `--live` is the tool for the canary and for ingest after that; it is
 *     not an approval.
 *
 * Hard safety rules (enforced by src/test/ecowitt-ingest-forwarder-safety.test.ts):
 *   - No Supabase SDK import. No service_role. No direct DB writes.
 *   - No Action Queue writes. No alert creation. No automation. No device control.
 *   - Never logs or writes PASSKEY, MAC, the bridge token, or MQTT credentials.
 *   - Only ever POSTs to an `ecowitt-ingest` URL, and only with `--live`.
 *
 * CLI flags:
 *   --live             POST to ECOWITT_INGEST_URL. Default is dry-run (no network).
 *   --once             Handle one message, then exit (0 = forwarded/accepted or dry-run; 1 otherwise).
 *   --write-report     Write a redacted report to ./tmp/ecowitt-forwarder-last-report.json.
 *   --topic <t>        MQTT topic (default ecowitt/grow or ECOWITT_MQTT_TOPIC).
 *   --mqtt-url <url>   Broker (default mqtt://127.0.0.1:1883 or ECOWITT_MQTT_URL).
 *
 * Env:
 *   ECOWITT_INGEST_URL     https://<project-ref>.supabase.co/functions/v1/ecowitt-ingest (live only)
 *   VERDANT_BRIDGE_TOKEN   vbt_... bridge token scoped to the target tent(s) (live only)
 *   ECOWITT_MQTT_USERNAME / ECOWITT_MQTT_PASSWORD   optional broker credentials
 */

export const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";
export const DEFAULT_MQTT_TOPIC = "ecowitt/grow";
export const DEFAULT_REPORT_PATH = "./tmp/ecowitt-forwarder-last-report.json";
export const TRANSPORT = "ecowitt_mqtt_ingest_forwarder";

/** Keys the HTTP bridge wraps around the gateway payload; not gateway fields. */
const BRIDGE_WRAPPER_KEYS = new Set(["received_at", "transport", "topic"]);
/** Never logged, never written to a report. */
const SECRET_KEY_RE = /passkey|^mac$|token|secret|password|api_key|application_key|app_key/i;
const AIR_CHANNEL_RE = /^(?:temp|humidity)([1-8])f?$/i;
const SOIL_CHANNEL_RE = /^soilmoisture([1-8])$/i;

export interface ForwarderFlags {
  live: boolean;
  once: boolean;
  writeReport: boolean;
  topic: string;
  mqttUrl: string;
}

export interface ForwarderEnv {
  ingestUrl: string | null;
  token: string | null;
  mqttUsername: string | null;
  mqttPassword: string | null;
}

export function parseFlags(argv: readonly string[], env: NodeJS.ProcessEnv): ForwarderFlags {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    live: argv.includes("--live"),
    once: argv.includes("--once"),
    writeReport: argv.includes("--write-report"),
    topic: get("--topic") ?? env.ECOWITT_MQTT_TOPIC ?? DEFAULT_MQTT_TOPIC,
    mqttUrl: get("--mqtt-url") ?? env.ECOWITT_MQTT_URL ?? DEFAULT_MQTT_URL,
  };
}

export function readEnv(env: NodeJS.ProcessEnv): ForwarderEnv {
  return {
    ingestUrl: env.ECOWITT_INGEST_URL?.trim() || null,
    token: env.VERDANT_BRIDGE_TOKEN?.trim() || null,
    mqttUsername: env.ECOWITT_MQTT_USERNAME ?? null,
    mqttPassword: env.ECOWITT_MQTT_PASSWORD ?? null,
  };
}

export type LiveConfigProblem =
  | "missing_ingest_url"
  | "ingest_url_not_https"
  | "ingest_url_not_ecowitt_ingest"
  | "missing_bridge_token"
  | "bridge_token_shape";

/**
 * Fail-closed checks for `--live`. The URL must be the ecowitt-ingest
 * function over https, so a raw gateway payload (which carries PASSKEY)
 * can never be posted anywhere else by mistake.
 */
export function liveConfigProblems(env: ForwarderEnv): LiveConfigProblem[] {
  const problems: LiveConfigProblem[] = [];
  if (!env.ingestUrl) problems.push("missing_ingest_url");
  else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(env.ingestUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== "https:") problems.push("ingest_url_not_https");
    else if (!/\/ecowitt-ingest\/?$/.test(parsed.pathname)) {
      problems.push("ingest_url_not_ecowitt_ingest");
    }
  }
  if (!env.token) problems.push("missing_bridge_token");
  else if (!/^vbt_[A-Za-z0-9_-]{8,}$/.test(env.token)) problems.push("bridge_token_shape");
  return problems;
}

export type PrepareReason =
  "malformed_json" | "not_an_object" | "missing_passkey" | "missing_dateutc";

export interface PayloadSummary {
  /** Air channels present as temp{n}f / humidity{n}. */
  air_channels: number[];
  /** Soil channels present as soilmoisture{n}. */
  soil_channels: number[];
  key_count: number;
  dateutc: string;
  station: string | null;
}

export type PreparedPayload =
  | { ok: true; payload: Record<string, unknown>; summary: PayloadSummary }
  | { ok: false; reason: PrepareReason };

function findKey(obj: Record<string, unknown>, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(obj).find((k) => k.toLowerCase() === lower);
}

/**
 * Pure. Turns one bridge MQTT message into the payload to forward:
 * the gateway fields with the bridge's wrapper keys removed. Refuses a
 * message that could not be a real gateway upload (no PASSKEY or no
 * dateutc), since the edge function would only answer `accepted: false`.
 */
export function prepareForwardPayload(text: string): PreparedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "malformed_json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "not_an_object" };
  }
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!BRIDGE_WRAPPER_KEYS.has(k)) payload[k] = v;
  }
  const passkeyKey = findKey(payload, "PASSKEY");
  if (!passkeyKey || !String(payload[passkeyKey] ?? "").trim()) {
    return { ok: false, reason: "missing_passkey" };
  }
  const dateutcKey = findKey(payload, "dateutc");
  const dateutc = dateutcKey ? String(payload[dateutcKey] ?? "").trim() : "";
  if (!dateutc) return { ok: false, reason: "missing_dateutc" };

  const air = new Set<number>();
  const soil = new Set<number>();
  for (const k of Object.keys(payload)) {
    const a = AIR_CHANNEL_RE.exec(k);
    if (a) air.add(Number(a[1]));
    const s = SOIL_CHANNEL_RE.exec(k);
    if (s) soil.add(Number(s[1]));
  }
  const stationKey = findKey(payload, "stationtype");
  return {
    ok: true,
    payload,
    summary: {
      air_channels: [...air].sort((x, y) => x - y),
      soil_channels: [...soil].sort((x, y) => x - y),
      key_count: Object.keys(payload).length,
      dateutc,
      station: stationKey ? String(payload[stationKey]) : null,
    },
  };
}

export interface ForwardRequest {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
}

/** Pure. The exact request the live path sends: JSON body, bearer auth. */
export function buildForwardRequest(
  payload: Record<string, unknown>,
  url: string,
  token: string,
): ForwardRequest {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  };
}

export interface ResponseSummary {
  status: number;
  accepted: boolean | null;
  inserted: number | null;
  skipped_duplicate: number | null;
  reason: string | null;
}

/** Pure. Keeps only the documented response fields; never echoes the body. */
export function summarizeResponse(status: number, bodyText: string): ResponseSummary {
  let body: Record<string, unknown> = {};
  try {
    const v = JSON.parse(bodyText);
    if (v && typeof v === "object" && !Array.isArray(v)) body = v as Record<string, unknown>;
  } catch {
    body = {};
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v.length <= 80 ? v : null);
  return {
    status,
    accepted: typeof body.accepted === "boolean" ? body.accepted : null,
    inserted: num(body.inserted),
    skipped_duplicate: num(body.skipped_duplicate),
    reason: str(body.reason) ?? str(body.error),
  };
}

/** Drops any key that could carry a credential or device identifier. */
export function redactForLog(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET_KEY_RE.test(k)) out[k] = "(redacted)";
    else if (typeof v === "string" && /^(vbt_|sk_|sbp_)/.test(v)) out[k] = "(redacted)";
    else out[k] = v;
  }
  return out;
}

export type ForwardOutcome =
  | { kind: "dry_run"; summary: PayloadSummary }
  | { kind: "forwarded"; summary: PayloadSummary; response: ResponseSummary }
  | { kind: "rejected_locally"; reason: PrepareReason }
  | { kind: "network_error"; summary: PayloadSummary; error: string };

/**
 * Handles one MQTT message. In dry-run it never calls `fetchImpl`. In live
 * mode it forwards exactly one request and reports the redacted response.
 */
export async function handleMessage(args: {
  text: string;
  flags: ForwarderFlags;
  env: ForwarderEnv;
  fetchImpl?: typeof fetch;
}): Promise<ForwardOutcome> {
  const prepared = prepareForwardPayload(args.text);
  if (!prepared.ok) return { kind: "rejected_locally", reason: prepared.reason };
  if (!args.flags.live) return { kind: "dry_run", summary: prepared.summary };

  const problems = liveConfigProblems(args.env);
  if (problems.length > 0) {
    // Config is checked before connecting, so this is defensive only.
    return { kind: "network_error", summary: prepared.summary, error: problems.join(",") };
  }
  const req = buildForwardRequest(prepared.payload, args.env.ingestUrl!, args.env.token!);
  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const r = await fetchImpl(req.url, req.init);
    return {
      kind: "forwarded",
      summary: prepared.summary,
      response: summarizeResponse(r.status, await r.text()),
    };
  } catch (e) {
    return {
      kind: "network_error",
      summary: prepared.summary,
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

/** `--once` exit code: 0 only when the one thing asked for happened. */
export function onceExitCode(outcome: ForwardOutcome): number {
  if (outcome.kind === "dry_run") return 0;
  if (outcome.kind === "forwarded") return outcome.response.accepted === true ? 0 : 1;
  return 1;
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(`[ecowitt-forwarder] ${event}`, redactForLog(fields));
}

async function writeReport(outcome: ForwardOutcome, flags: ForwarderFlags): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const report = {
    transport: TRANSPORT,
    written_at: new Date().toISOString(),
    live: flags.live,
    topic: flags.topic,
    outcome: redactForLog(outcome as unknown as Record<string, unknown>),
  };
  await mkdir(path.dirname(DEFAULT_REPORT_PATH), { recursive: true });
  await writeFile(DEFAULT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  log("report written", { path: DEFAULT_REPORT_PATH });
}

async function connectMqtt(flags: ForwarderFlags, env: ForwarderEnv): Promise<any> {
  let mqtt: any;
  try {
    mqtt = await (Function("m", "return import(m)") as any)("mqtt");
  } catch {
    console.error("[ecowitt-forwarder] mqtt package not installed. Run `bun add --no-save mqtt`.");
    process.exit(2);
  }
  return mqtt.connect(flags.mqttUrl, {
    username: env.mqttUsername ?? undefined,
    password: env.mqttPassword ?? undefined,
    reconnectPeriod: 5000,
  });
}

export async function main(argv: readonly string[], processEnv: NodeJS.ProcessEnv): Promise<void> {
  const flags = parseFlags(argv, processEnv);
  const env = readEnv(processEnv);

  if (flags.live) {
    const problems = liveConfigProblems(env);
    if (problems.length > 0) {
      console.error(
        `[ecowitt-forwarder] --live refused (fail closed): ${problems.join(", ")}. ` +
          "ECOWITT_INGEST_URL must be the https ecowitt-ingest function URL and VERDANT_BRIDGE_TOKEN a vbt_ token.",
      );
      process.exit(2);
    }
  }

  log("startup", {
    mode: flags.live
      ? "LIVE — forwarding to ecowitt-ingest"
      : "dry-run — nothing leaves this machine",
    topic: flags.topic,
    broker: flags.mqttUrl.replace(/\/\/[^@]*@/, "//"),
    ingest_url: flags.live ? env.ingestUrl : "(none — dry-run)",
    once: flags.once,
  });

  const client = await connectMqtt(flags, env);
  client.on("connect", () => {
    log("subscribed", { topic: flags.topic });
    client.subscribe(flags.topic);
  });
  client.on("error", (e: Error) => log("mqtt_error", { error: e.message }));
  client.on("message", async (_topic: string, buf: Buffer) => {
    const outcome = await handleMessage({ text: buf.toString("utf8"), flags, env });
    log(outcome.kind, outcome as unknown as Record<string, unknown>);
    if (flags.writeReport) await writeReport(outcome, flags);
    if (flags.once) {
      client.end();
      process.exit(onceExitCode(outcome));
    }
  });
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ecowitt-ingest-forwarder");

if (invokedDirectly) {
  void main(process.argv.slice(2), process.env);
}

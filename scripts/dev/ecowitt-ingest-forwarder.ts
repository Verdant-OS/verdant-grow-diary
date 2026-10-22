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
 *   - DRY-RUN BY DEFAULT. Without `--live` no HTTPS ingest POST is made. The
 *     forwarder still connects to the configured MQTT broker and subscribes,
 *     so a remote broker URL does carry MQTT credentials off this machine.
 *   - `--live` fails closed unless ECOWITT_INGEST_URL is exactly the Verdant
 *     project's ecowitt-ingest function URL (APPROVED_INGEST_URLS) and
 *     VERDANT_BRIDGE_TOKEN has the `vbt_` shape. The POST never follows a
 *     redirect, times out after LIVE_REQUEST_TIMEOUT_MS, and retries only the
 *     transient cases in docs/bridge-client-retry-guidance.md with Full Jitter.
 *   - A message over MAX_MESSAGE_BYTES is rejected before it is parsed.
 *   - EcoWitt ingest is dry-run only until the gates in
 *     docs/ecowitt-future-real-ingest-gates.md are cleared by the owner.
 *     `--live` is the tool for the canary and for ingest after that; it is
 *     not an approval.
 *
 * Hard safety rules (enforced by src/test/ecowitt-ingest-forwarder-safety.test.ts):
 *   - No Supabase SDK import. No service_role. No direct DB writes.
 *   - No Action Queue writes. No alert creation. No automation. No device control.
 *   - Never logs or writes PASSKEY, MAC, the bridge token, or MQTT credentials.
 *   - Only ever POSTs to the approved `ecowitt-ingest` URL, and only with
 *     `--live`. An accepted live POST asks that edge function to persist
 *     sensor_readings and bridge-token usage; the forwarder itself has no
 *     database access.
 *
 * CLI flags:
 *   --live             POST to ECOWITT_INGEST_URL. Default is dry-run: it still connects to
 *                      the MQTT broker and subscribes, but never sends the ingest POST.
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
/** The Verdant Supabase project (the same ref as VITE_SUPABASE_URL in .env). */
export const VERDANT_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
/**
 * The only destinations a live POST may use (Codex P1 on #2335 at 79ce2801):
 * a raw gateway payload carries the PASSKEY and the request carries the
 * bridge token, so "https and the right path" is not a destination check.
 */
export const APPROVED_INGEST_URLS: readonly string[] = [
  `https://${VERDANT_PROJECT_REF}.supabase.co/functions/v1/ecowitt-ingest`,
  `https://${VERDANT_PROJECT_REF}.functions.supabase.co/ecowitt-ingest`,
];
/** Broker-controlled input is bounded before it is parsed (Codex P2 on #2335). */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** Summary strings copied from the payload are capped before they are logged. */
export const MAX_SUMMARY_STRING = 64;
/** Live POST timeout and Full Jitter retry policy (docs/bridge-client-retry-guidance.md §4). */
export const LIVE_REQUEST_TIMEOUT_MS = 15_000;
export const LIVE_RETRY_POLICY = { maxRetries: 4, baseDelayMs: 3_000, maxDelayMs: 45_000 } as const;
/** `--once` gives the broker this long to connect before exiting nonzero. */
export const MQTT_CONNECT_TIMEOUT_MS = 20_000;

/** Keys the HTTP bridge wraps around the gateway payload; not gateway fields. */
const BRIDGE_WRAPPER_KEYS = new Set(["received_at", "transport", "topic"]);
/** Never logged, never written to a report. */
const SECRET_KEY_RE = /passkey|^mac$|token|secret|password|api_key|application_key|app_key/i;
// The same keys `supabase/functions/_shared/ecowittChannelTentRouter.ts` routes:
// `temp{n}f` and `humidity{n}` for air, `soilmoisture{n}` for soil. Anything else
// (`temp2`, `humidity3f`) is not a channel, so the dry-run summary never claims
// one that live ingest would not read (Codex P2 on #2335 at 3df0e691).
const AIR_TEMP_F_RE = /^temp([1-8])f$/i;
const AIR_HUMIDITY_RE = /^humidity([1-8])$/i;
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
  | "ingest_url_not_approved_origin"
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
    } else {
      // Exact approved origin and canonical path; no userinfo, query or fragment.
      const canonical = parsed.origin + parsed.pathname.replace(/\/+$/, "");
      if (
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        !APPROVED_INGEST_URLS.includes(canonical)
      ) {
        problems.push("ingest_url_not_approved_origin");
      }
    }
  }
  if (!env.token) problems.push("missing_bridge_token");
  else if (!/^vbt_[A-Za-z0-9_-]{8,}$/.test(env.token)) problems.push("bridge_token_shape");
  return problems;
}

export type PrepareReason =
  | "malformed_json"
  | "not_an_object"
  | "missing_passkey"
  | "invalid_passkey"
  | "missing_dateutc"
  | "invalid_dateutc"
  | "payload_too_large";

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
  if (Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES) {
    return { ok: false, reason: "payload_too_large" };
  }
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
  // Untrusted input: only a string is ever read (Copilot on #2335). `String(x)`
  // on an object with a null `toString` throws, which would escape the MQTT
  // listener as an unhandled rejection.
  const passkeyKey = findKey(payload, "PASSKEY");
  const passkey = passkeyKey ? payload[passkeyKey] : undefined;
  if (passkey === undefined || passkey === null) return { ok: false, reason: "missing_passkey" };
  if (typeof passkey !== "string") return { ok: false, reason: "invalid_passkey" };
  if (!passkey.trim()) return { ok: false, reason: "missing_passkey" };
  const dateutcKey = findKey(payload, "dateutc");
  const dateutcRaw = dateutcKey ? payload[dateutcKey] : undefined;
  if (dateutcRaw === undefined || dateutcRaw === null) {
    return { ok: false, reason: "missing_dateutc" };
  }
  if (typeof dateutcRaw !== "string") return { ok: false, reason: "invalid_dateutc" };
  // A date never contains the credential. A hostile upload that embeds the
  // PASSKEY in `dateutc` beside other text would otherwise reach the summary,
  // where the standalone-shape redactor cannot see it (Codex P1 on #2335 at
  // 3df0e691). Checked before truncation so a cut fragment cannot slip through.
  if (dateutcRaw.includes(passkey)) return { ok: false, reason: "invalid_dateutc" };
  const dateutc = dateutcRaw.trim().slice(0, MAX_SUMMARY_STRING);
  if (!dateutc) return { ok: false, reason: "missing_dateutc" };

  const air = new Set<number>();
  const soil = new Set<number>();
  for (const k of Object.keys(payload)) {
    const a = AIR_TEMP_F_RE.exec(k) ?? AIR_HUMIDITY_RE.exec(k);
    if (a) air.add(Number(a[1]));
    const s = SOIL_CHANNEL_RE.exec(k);
    if (s) soil.add(Number(s[1]));
  }
  const stationKey = findKey(payload, "stationtype");
  const stationRaw = stationKey ? payload[stationKey] : undefined;
  // A hostile upload can copy its PASSKEY into any text field; never let the
  // credential value reach the summary (Codex P1 on #2335 at 79ce2801).
  const station =
    typeof stationRaw === "string" && !stationRaw.includes(passkey)
      ? stationRaw.slice(0, MAX_SUMMARY_STRING)
      : null;
  return {
    ok: true,
    payload,
    summary: {
      air_channels: [...air].sort((x, y) => x - y),
      soil_channels: [...soil].sort((x, y) => x - y),
      key_count: Object.keys(payload).length,
      dateutc,
      station,
    },
  };
}

export interface ForwardRequest {
  url: string;
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    /** A redirect would resend PASSKEY and the bearer token elsewhere; refuse it. */
    redirect: "error";
  };
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
      redirect: "error",
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

/** Token shapes that must never appear in output, wherever they sit in a string. */
const EMBEDDED_SECRET_RE = /\b(?:vbt|sk|sbp)_[A-Za-z0-9_-]{4,}/g;
/**
 * An EcoWitt PASSKEY is a 32-hex digest; scrub that shape wherever it appears,
 * including inside a longer token with adjacent text (Codex P1 on #2335 at
 * 3df0e691). Over-redacting another long hex string in a log is harmless.
 */
const HEX32_RE = /[0-9a-f]{32}/gi;
/** `scheme://user:password@host` → `scheme://(redacted)@host`. */
const URL_USERINFO_RE = /(\/\/)[^/\s@]+@/g;
/** `?token=…`, `&password=…` and similar query credentials. */
const URL_SECRET_QUERY_RE = /([?&](?:token|key|api_key|password|passkey|secret)=)[^&\s]*/gi;

/** Pure. Redacts embedded tokens and URL credentials inside one string. */
export function redactString(value: string): string {
  return value
    .replace(EMBEDDED_SECRET_RE, "(redacted)")
    .replace(HEX32_RE, "(redacted)")
    .replace(URL_USERINFO_RE, "$1(redacted)@")
    .replace(URL_SECRET_QUERY_RE, "$1(redacted)");
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "(redacted)" : redactValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Drops any key that could carry a credential or device identifier, at every
 * depth, and scrubs token shapes and URL credentials from every string
 * (Copilot on #2335: outcome summaries and the broker URL are nested).
 */
export function redactForLog(fields: Record<string, unknown>): Record<string, unknown> {
  return redactValue(fields) as Record<string, unknown>;
}

export type ForwardOutcome =
  | { kind: "dry_run"; summary: PayloadSummary }
  | { kind: "forwarded"; summary: PayloadSummary; response: ResponseSummary; attempts: number }
  | { kind: "rejected_locally"; reason: PrepareReason }
  | { kind: "network_error"; summary: PayloadSummary; error: string; attempts: number };

export interface LiveRetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Pure. `random(0, min(maxDelay, base * 2^attempt))`, as the bridge-client guidance states. */
export function fullJitterDelayMs(
  attempt: number,
  random: () => number = Math.random,
  policy: { baseDelayMs: number; maxDelayMs: number } = LIVE_RETRY_POLICY,
): number {
  return Math.floor(random() * Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt));
}

/** Only the transient cases the guidance names are retried; 4xx auth/payload errors are final. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Handles one MQTT message. In dry-run it never calls `fetchImpl`. In live
 * mode it forwards one request per attempt, bounded by LIVE_REQUEST_TIMEOUT_MS
 * and the Full Jitter retry policy for transient failures only, and reports
 * the redacted response (Codex P2 on #2335 at 79ce2801).
 */
export async function handleMessage(args: {
  text: string;
  flags: ForwarderFlags;
  env: ForwarderEnv;
  fetchImpl?: typeof fetch;
  retry?: LiveRetryOptions;
}): Promise<ForwardOutcome> {
  const prepared = prepareForwardPayload(args.text);
  if (!prepared.ok) return { kind: "rejected_locally", reason: prepared.reason };
  if (!args.flags.live) return { kind: "dry_run", summary: prepared.summary };

  const problems = liveConfigProblems(args.env);
  if (problems.length > 0) {
    // Config is checked before connecting, so this is defensive only.
    return {
      kind: "network_error",
      summary: prepared.summary,
      error: problems.join(","),
      attempts: 0,
    };
  }
  const req = buildForwardRequest(prepared.payload, args.env.ingestUrl!, args.env.token!);
  const fetchImpl = args.fetchImpl ?? fetch;
  const maxRetries = args.retry?.maxRetries ?? LIVE_RETRY_POLICY.maxRetries;
  const timeoutMs = args.retry?.timeoutMs ?? LIVE_REQUEST_TIMEOUT_MS;
  const sleep = args.retry?.sleep ?? realSleep;
  const random = args.retry?.random ?? Math.random;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetchImpl(req.url, { ...req.init, signal: controller.signal });
      const response = summarizeResponse(r.status, await r.text());
      // A retryable status (408/429/5xx) with retries left falls through to the sleep below.
      if (!isRetryableStatus(r.status) || attempt >= maxRetries) {
        return { kind: "forwarded", summary: prepared.summary, response, attempts: attempt + 1 };
      }
    } catch (e) {
      if (attempt >= maxRetries) {
        return {
          kind: "network_error",
          summary: prepared.summary,
          error: e instanceof Error ? e.message : "unknown",
          attempts: attempt + 1,
        };
      }
    } finally {
      clearTimeout(timer);
    }
    await sleep(fullJitterDelayMs(attempt, random));
  }
}

/** `--once` exit code: 0 only when the one thing asked for happened. */
export function onceExitCode(outcome: ForwardOutcome): number {
  if (outcome.kind === "dry_run") return 0;
  if (outcome.kind === "forwarded") {
    const { status, accepted } = outcome.response;
    return accepted === true && status >= 200 && status < 300 ? 0 : 1;
  }
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

/**
 * The `--once` claim, shared between the message handler and the client
 * lifecycle so a broker error after the one message is claimed cannot abort
 * its in-flight POST (Codex P2 on #2335 at 3df0e691).
 */
export interface OnceClaim {
  claimed: boolean;
}

export interface MessageHandlerDeps {
  flags: ForwarderFlags;
  env: ForwarderEnv;
  fetchImpl?: typeof fetch;
  writeReportImpl?: (outcome: ForwardOutcome, flags: ForwarderFlags) => Promise<void>;
  /** Called exactly once in `--once` mode with the exit code. */
  onDone: (exitCode: number) => void;
  /** Shared claim; a private one is used when the caller passes none. */
  claim?: OnceClaim;
}

/**
 * The MQTT "message" listener. The EventEmitter does not await it, so in
 * `--once` mode the first message is claimed synchronously, before any
 * await, and every later delivery is ignored: one live POST at most
 * (Copilot on #2335). A throw inside the handler is logged, never left as an
 * unhandled rejection.
 */
export function createMessageHandler(
  deps: MessageHandlerDeps,
): (topic: string, buf: Buffer | string) => void {
  const claim: OnceClaim = deps.claim ?? { claimed: false };
  return (_topic, buf) => {
    if (deps.flags.once) {
      if (claim.claimed) {
        log("ignored_extra_message", { reason: "--once is already handling a message" });
        return;
      }
      claim.claimed = true;
    }
    const text = typeof buf === "string" ? buf : buf.toString("utf8");
    void (async () => {
      let exitCode = 1;
      try {
        const outcome = await handleMessage({
          text,
          flags: deps.flags,
          env: deps.env,
          fetchImpl: deps.fetchImpl,
        });
        log(outcome.kind, outcome as unknown as Record<string, unknown>);
        if (deps.flags.writeReport)
          await (deps.writeReportImpl ?? writeReport)(outcome, deps.flags);
        exitCode = onceExitCode(outcome);
      } catch (e) {
        log("handler_error", { error: e instanceof Error ? e.message : "unknown" });
      }
      if (deps.flags.once) deps.onDone(exitCode);
    })();
  };
}

export interface MqttClientLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  subscribe(topic: string, callback?: (err?: Error | null) => void): unknown;
}

export interface ClientLifecycleDeps {
  flags: ForwarderFlags;
  /** Called once in `--once` mode when the broker connection or subscription fails. */
  onFatal: (exitCode: number) => void;
  connectTimeoutMs?: number;
  /** The handler's `--once` claim; once set, a broker error no longer ends the run. */
  claim?: OnceClaim;
}

/**
 * Connection and subscription handling. In `--once` mode a connect timeout,
 * a broker error or a rejected subscription ends the run with exit 2 instead
 * of reconnecting forever with no message to handle (Codex P2 on #2335 at
 * 79ce2801). Continuous mode keeps the client's own reconnect.
 */
export function attachClientLifecycle(client: MqttClientLike, deps: ClientLifecycleDeps): void {
  let connected = false;
  let ended = false;
  const fatal = (reason: string, fields: Record<string, unknown> = {}) => {
    if (deps.flags.once && deps.claim?.claimed) {
      // The one message is already in flight; its own result sets the exit
      // code, so a broker error now is logged, not fatal (Codex P2 at 3df0e691).
      log("mqtt_error_after_claim", { reason, ...fields });
      return;
    }
    log("mqtt_fatal", { reason, ...fields });
    if (deps.flags.once && !ended) {
      ended = true;
      deps.onFatal(2);
    }
  };
  const timeoutMs = deps.connectTimeoutMs ?? MQTT_CONNECT_TIMEOUT_MS;
  const timer = deps.flags.once
    ? setTimeout(() => {
        if (!connected) fatal("connect_timeout", { timeout_ms: timeoutMs });
      }, timeoutMs)
    : null;
  client.on("connect", () => {
    connected = true;
    if (timer) clearTimeout(timer);
    client.subscribe(deps.flags.topic, (err) => {
      if (err) fatal("subscribe_failed", { error: err.message });
      else log("subscribed", { topic: deps.flags.topic });
    });
  });
  client.on("error", (e: Error) => fatal("mqtt_error", { error: e.message }));
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
    // One-shot runs fail fast instead of reconnecting with nothing to handle.
    reconnectPeriod: flags.once ? 0 : 5000,
    connectTimeout: MQTT_CONNECT_TIMEOUT_MS,
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
          `ECOWITT_INGEST_URL must be exactly ${APPROVED_INGEST_URLS.join(" or ")} and VERDANT_BRIDGE_TOKEN a vbt_ token.`,
      );
      process.exit(2);
    }
  }

  log("startup", {
    mode: flags.live
      ? "LIVE — forwarding to ecowitt-ingest"
      : "dry-run — no ingest POST; MQTT broker connection only",
    topic: flags.topic,
    broker: flags.mqttUrl,
    ingest_url: flags.live ? env.ingestUrl : "(none — dry-run)",
    once: flags.once,
  });

  const client = await connectMqtt(flags, env);
  const claim: OnceClaim = { claimed: false };
  attachClientLifecycle(client, {
    flags,
    claim,
    onFatal: (exitCode) => {
      client.end();
      process.exit(exitCode);
    },
  });
  client.on(
    "message",
    createMessageHandler({
      flags,
      env,
      claim,
      onDone: (exitCode) => {
        client.end();
        process.exit(exitCode);
      },
    }),
  );
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ecowitt-ingest-forwarder");

if (invokedDirectly) {
  void main(process.argv.slice(2), process.env);
}

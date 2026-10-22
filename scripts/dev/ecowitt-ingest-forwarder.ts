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

/**
 * Pure. Throws `missing_option_value:<flag>` when a value-taking flag is last
 * or followed by another option, so `--mqtt-url --once` never reaches the
 * broker with `--once` as its URL (Codex P2 on #2335 at acab6b12).
 */
export function parseFlags(argv: readonly string[], env: NodeJS.ProcessEnv): ForwarderFlags {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing_option_value:${name}`);
    }
    return value;
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
  | "duplicate_passkey"
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
  // Two keys that differ only in case would leave a second credential value
  // the summary checks never see (Codex P1 on #2335 at 5a7accaf).
  if (Object.keys(payload).filter((k) => k.toLowerCase() === "passkey").length > 1) {
    return { ok: false, reason: "duplicate_passkey" };
  }
  const passkeyKey = findKey(payload, "PASSKEY");
  const passkey = passkeyKey ? payload[passkeyKey] : undefined;
  if (passkey === undefined || passkey === null) return { ok: false, reason: "missing_passkey" };
  if (typeof passkey !== "string") return { ok: false, reason: "invalid_passkey" };
  if (!passkey.trim()) return { ok: false, reason: "missing_passkey" };
  // The extracted value is a credential whatever its shape: from here on the
  // redactor scrubs it literally and case-insensitively (Codex P1 at acab6b12).
  registerSecretValue(passkey);
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
  if (containsSecret(dateutcRaw)) return { ok: false, reason: "invalid_dateutc" };
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
  // A hostile upload can copy its PASSKEY, or any credential shape, into any
  // text field; never let a credential value reach the summary (Codex P1 on
  // #2335 at 79ce2801 and 0676e200).
  const station =
    typeof stationRaw === "string" && !containsSecret(stationRaw)
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
    redirect: "manual";
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
      redirect: "manual",
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

/**
 * Token shapes that must never appear in output, wherever they sit in a
 * string: no leading word boundary, so a token glued to other text (for
 * example inside `dateutc`) is still caught (Codex P1 on #2335 at 0676e200).
 */
const EMBEDDED_SECRET_RE = /(?:vbt|sk|sbp)_[A-Za-z0-9_-]{4,}/g;
/**
 * An EcoWitt PASSKEY is a 32-hex digest; scrub that shape wherever it appears,
 * including inside a longer token with adjacent text (Codex P1 on #2335 at
 * 3df0e691). Over-redacting another long hex string in a log is harmless.
 */
const HEX32_RE = /[0-9a-f]{32}/gi;
/**
 * MAC addresses in the colon, hyphen and dotted forms, with no word boundary
 * so one glued to identifier text (`GWAA:BB:…`) is still caught. A gateway
 * identifier copied into a text field such as `stationtype` must never be
 * echoed (Codex P1 on #2335 at 3c16b6a4 and efeae597).
 */
const MAC_RE = /(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}|(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}/gi;
/**
 * A MAC written as 12 contiguous hex digits (Codex P1 on #2335 at 5a7accaf).
 * Any 12-hex run is scrubbed, glued or not; over-redacting another hex string
 * in a log is harmless.
 */
const MAC12_RE = /[0-9a-f]{12}/gi;
/**
 * `scheme://user:password@host` → `scheme://(redacted)@host`. Greedy up to the
 * last `@` before the path, so a password that itself contains `@` is consumed
 * whole (Codex P1 on #2335 at 5a7accaf).
 */
const URL_USERINFO_RE = /(\/\/)[^/\s]*@/g;
/** `?token=…`, `&password=…` and similar query credentials. */
const URL_SECRET_QUERY_RE = /([?&](?:token|key|api_key|password|passkey|secret)=)[^&\s]*/gi;

/**
 * Credential values known at run time: the PASSKEY extracted from each
 * message, and the MQTT username and password from the environment or the
 * broker URL. A PASSKEY need not be a 32-hex digest, and a hostile field can
 * echo it in another case or URI-encoded, so these are scrubbed literally,
 * case-insensitively and in their encoded form, ahead of the shape rules
 * (Codex P1 on #2335 at acab6b12). Values under 4 characters are not
 * registered: they would redact ordinary text.
 */
const knownSecrets = new Set<string>();

export function registerSecretValue(value: string | null | undefined): void {
  if (typeof value !== "string" || value.length < 4) return;
  knownSecrets.add(value);
  const encoded = encodeURIComponent(value);
  if (encoded !== value) knownSecrets.add(encoded);
}

/** Test seam: forgets every registered value. */
export function clearSecretValues(): void {
  knownSecrets.clear();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactKnownSecrets(value: string): string {
  let out = value;
  for (const secret of knownSecrets) {
    out = out.replace(new RegExp(escapeRegExp(secret), "gi"), "(redacted)");
  }
  return out;
}

/** Pure given the registry. True when the redactor would change the string. */
export function containsSecret(value: string): boolean {
  return redactString(value) !== value;
}

/** Pure given the registry. Redacts known values, credential shapes and URL credentials inside one string. */
export function redactString(value: string): string {
  return redactKnownSecrets(value)
    .replace(EMBEDDED_SECRET_RE, "(redacted)")
    .replace(MAC_RE, "(redacted)")
    .replace(HEX32_RE, "(redacted)")
    .replace(MAC12_RE, "(redacted)")
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
      // `redirect: "manual"` hands a 3xx back instead of following it. The
      // destination is fixed, so a redirect is final: never followed, never
      // retried with the credential-bearing body (Codex P2 at efeae597).
      if (r.status >= 300 && r.status < 400) {
        return {
          kind: "network_error",
          summary: prepared.summary,
          error: `redirect_refused_${r.status}`,
          attempts: attempt + 1,
        };
      }
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

/**
 * Pure. The `--write-report` document, redacted as a whole: the configured
 * topic is operator input and can carry a token shape just as the outcome can
 * (Codex P1 on #2335 at 3c16b6a4).
 */
export function buildReport(
  outcome: ForwardOutcome,
  flags: ForwarderFlags,
  writtenAt: string,
): Record<string, unknown> {
  return redactForLog({
    transport: TRANSPORT,
    written_at: writtenAt,
    live: flags.live,
    topic: flags.topic,
    outcome: outcome as unknown as Record<string, unknown>,
  });
}

export interface SerialQueue {
  /** Runs `task` after every task submitted before it has settled. */
  run<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * Pure scheduling. One shared file must not be written by two jobs at once:
 * the bounded runner allows up to MAX_INFLIGHT jobs, so report writes are
 * serialised separately (Codex P2 on #2335 at 5a7accaf). A failed task never
 * blocks the next.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run(task) {
      const next = tail.then(task, task);
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}

const reportWrites = createSerialQueue();

/**
 * The production report writer: one write at a time through `reportWrites`,
 * and the previous report is replaced only once the new document is complete
 * (temporary file in the same directory, then rename), so an interrupted
 * write never leaves an empty or partial file (Codex P2 on #2335 at acab6b12).
 */
export function writeReport(outcome: ForwardOutcome, flags: ForwarderFlags): Promise<void> {
  return reportWrites.run(async () => {
    const { mkdir, rename, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const report = buildReport(outcome, flags, new Date().toISOString());
    await mkdir(path.dirname(DEFAULT_REPORT_PATH), { recursive: true });
    const partial = `${DEFAULT_REPORT_PATH}.partial`;
    await writeFile(partial, JSON.stringify(report, null, 2), "utf8");
    await rename(partial, DEFAULT_REPORT_PATH);
    log("report written", { path: DEFAULT_REPORT_PATH });
  });
}

/**
 * The `--once` claim, shared between the message handler and the client
 * lifecycle so a broker error after the one message is claimed cannot abort
 * its in-flight POST (Codex P2 on #2335 at 3df0e691).
 */
export interface OnceClaim {
  claimed: boolean;
}

/** Continuous mode handles at most this many messages at once. */
export const MAX_INFLIGHT = 4;
/** Messages waiting for a slot beyond this are dropped, with a log line. */
export const MAX_BACKLOG = 32;

export interface BoundedRunner {
  /** Starts the job now, queues it, or drops it when the backlog is full. */
  submit(job: () => Promise<void>): "started" | "queued" | "dropped";
  readonly inflight: number;
  readonly backlog: number;
}

/**
 * Pure scheduling. Jobs run at most `maxInflight` at a time, in arrival
 * order; a job never throws (the handler catches), so a settled job frees its
 * slot either way. A bounded backlog keeps a burst, or a slow ingest with
 * retries, from growing concurrent POSTs and memory without limit (Codex P2
 * on #2335 at 0676e200).
 */
export function createBoundedRunner(maxInflight: number, maxBacklog: number): BoundedRunner {
  let inflight = 0;
  const backlog: Array<() => Promise<void>> = [];
  const start = (job: () => Promise<void>) => {
    inflight += 1;
    const finish = () => {
      inflight -= 1;
      const next = backlog.shift();
      if (next) start(next);
    };
    void job().then(finish, finish);
  };
  return {
    submit(job) {
      if (inflight < maxInflight) {
        start(job);
        return "started";
      }
      if (backlog.length >= maxBacklog) return "dropped";
      backlog.push(job);
      return "queued";
    },
    get inflight() {
      return inflight;
    },
    get backlog() {
      return backlog.length;
    },
  };
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
  /** Continuous-mode scheduler; the default bounds are MAX_INFLIGHT / MAX_BACKLOG. */
  runner?: BoundedRunner;
}

type Finish = (outcome: ForwardOutcome | null) => Promise<void>;

/**
 * The runner job for one decoded frame: parse, forward in live mode, finish.
 * A throw inside is logged, never left as an unhandled rejection.
 */
function messageJob(deps: MessageHandlerDeps, text: string, finish: Finish): () => Promise<void> {
  return async () => {
    let outcome: ForwardOutcome | null = null;
    try {
      outcome = await handleMessage({
        text,
        flags: deps.flags,
        env: deps.env,
        fetchImpl: deps.fetchImpl,
      });
    } catch (e) {
      log("handler_error", { error: e instanceof Error ? e.message : "unknown" });
    }
    await finish(outcome);
  };
}

/**
 * The MQTT "message" listener. The EventEmitter does not await it, so in
 * `--once` mode the first message is claimed synchronously, before any
 * await, and every later delivery is ignored: one live POST at most
 * (Copilot on #2335). Every message, oversized ones included, goes through a
 * bounded runner, so a burst never fans out into unbounded concurrent POSTs,
 * retries or report writes (Codex P2 at 0676e200 and efeae597).
 */
export function createMessageHandler(
  deps: MessageHandlerDeps,
): (topic: string, buf: Buffer | string) => void {
  const claim: OnceClaim = deps.claim ?? { claimed: false };
  const runner = deps.runner ?? createBoundedRunner(MAX_INFLIGHT, MAX_BACKLOG);
  return (_topic, buf) => {
    if (deps.flags.once) {
      if (claim.claimed) {
        log("ignored_extra_message", { reason: "--once is already handling a message" });
        return;
      }
      claim.claimed = true;
    }
    const finish: Finish = async (outcome) => {
      let exitCode = 1;
      try {
        if (outcome) {
          log(outcome.kind, outcome as unknown as Record<string, unknown>);
          if (deps.flags.writeReport)
            await (deps.writeReportImpl ?? writeReport)(outcome, deps.flags);
          exitCode = onceExitCode(outcome);
        }
      } catch (e) {
        log("handler_error", { error: e instanceof Error ? e.message : "unknown" });
      }
      if (deps.flags.once) deps.onDone(exitCode);
    };
    // The size bound applies to the raw frame before it is decoded, so the
    // backlog holds at most MAX_BACKLOG × MAX_MESSAGE_BYTES of text and an
    // oversized frame is never retained by a waiting closure (Codex P2 at
    // 3c16b6a4). Its rejection still runs through the runner (Codex P2 at efeae597).
    const bytes = typeof buf === "string" ? Buffer.byteLength(buf, "utf8") : buf.byteLength;
    const job =
      bytes > MAX_MESSAGE_BYTES
        ? () => finish({ kind: "rejected_locally", reason: "payload_too_large" })
        : messageJob(deps, typeof buf === "string" ? buf : buf.toString("utf8"), finish);
    if (runner.submit(job) === "dropped") {
      log("dropped_backlog_full", {
        inflight: runner.inflight,
        backlog: runner.backlog,
        max_inflight: MAX_INFLIGHT,
        max_backlog: MAX_BACKLOG,
      });
    }
  };
}

export interface MqttClientLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  subscribe(
    topic: string,
    callback?: (
      err?: Error | null,
      granted?: ReadonlyArray<{ topic: string; qos: number }>,
    ) => void,
  ): unknown;
}

export interface ClientLifecycleDeps {
  flags: ForwarderFlags;
  /**
   * Called once when the run cannot continue: in `--once` mode on any broker
   * failure before the claim; in every mode when the subscription is refused,
   * since a connected client with no subscription would idle forever and
   * silently lose readings (Codex P2 on #2335 at acab6b12).
   */
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
  const fatal = (reason: string, fields: Record<string, unknown> = {}, terminal = false) => {
    if (deps.flags.once && deps.claim?.claimed) {
      // The one message is already in flight; its own result sets the exit
      // code, so a broker error now is logged, not fatal (Codex P2 at 3df0e691).
      log("mqtt_error_after_claim", { reason, ...fields });
      return;
    }
    log("mqtt_fatal", { reason, ...fields });
    if ((deps.flags.once || terminal) && !ended) {
      ended = true;
      deps.onFatal(2);
    }
  };
  const timeoutMs = deps.connectTimeoutMs ?? MQTT_CONNECT_TIMEOUT_MS;
  // One deadline covers both CONNACK and SUBACK: the client's connectTimeout
  // waits only for CONNACK, and a broker that accepts the connection but never
  // answers the subscription would otherwise hang a `--once` run forever
  // (Codex P2 on #2335 at 3c16b6a4).
  const timer = deps.flags.once
    ? setTimeout(() => {
        fatal(connected ? "subscribe_timeout" : "connect_timeout", { timeout_ms: timeoutMs });
      }, timeoutMs)
    : null;
  client.on("connect", () => {
    connected = true;
    client.subscribe(deps.flags.topic, (err, granted) => {
      if (err) return fatal("subscribe_failed", { error: err.message }, true);
      // A broker can refuse the topic without an error: the SUBACK grant comes
      // back with QoS 128, or with no grant at all (Codex P2 on #2335 at 5a7accaf).
      const refused =
        !Array.isArray(granted) ||
        granted.length === 0 ||
        granted.some((grant) => !grant || grant.qos === 128);
      if (refused) {
        return fatal("subscribe_failed", { error: "subscription refused by broker" }, true);
      }
      if (timer) clearTimeout(timer);
      log("subscribed", { topic: deps.flags.topic });
    });
  });
  client.on("error", (e: Error) => fatal("mqtt_error", { error: e.message }));
  // A broker disconnect in `--once` mode has nothing to reconnect for
  // (reconnectPeriod is 0): end the run instead of idling until the connect
  // timer, or forever once connected (Codex P2 on #2335 at 0676e200). After
  // the one message is claimed `fatal` only logs. Continuous mode logs the
  // event and leaves the client's own reconnect to it.
  for (const event of ["close", "offline"] as const) {
    client.on(event, () => {
      if (deps.flags.once) fatal(`mqtt_${event}`);
      else log(`mqtt_${event}`, { reconnecting: true });
    });
  }
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

/**
 * Pure. The credential values a run knows before any message arrives: the
 * MQTT username and password from the environment and from the broker URL's
 * userinfo, so a topic or payload that echoes them is redacted literally.
 */
export function configuredSecretValues(flags: ForwarderFlags, env: ForwarderEnv): string[] {
  const values = [env.mqttUsername, env.mqttPassword];
  try {
    const url = new URL(flags.mqttUrl);
    values.push(decodeURIComponent(url.username), decodeURIComponent(url.password));
  } catch {
    // An unparseable broker URL is the MQTT client's error to report.
  }
  return values.filter((v): v is string => typeof v === "string" && v.length >= 4);
}

export async function main(argv: readonly string[], processEnv: NodeJS.ProcessEnv): Promise<void> {
  let flags: ForwarderFlags;
  try {
    flags = parseFlags(argv, processEnv);
  } catch (e) {
    console.error(
      `[ecowitt-forwarder] refused: ${e instanceof Error ? e.message : "bad_arguments"}. ` +
        "--topic and --mqtt-url each take a value.",
    );
    process.exit(2);
  }
  const env = readEnv(processEnv);
  for (const value of configuredSecretValues(flags, env)) registerSecretValue(value);

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

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
 *   - Every inbound MQTT packet passes a stream guard before MQTT.js parses it:
 *     a fixed header declaring more than MAX_INBOUND_PACKET_BYTES, or a
 *     malformed remaining length, closes the connection before the body is
 *     buffered. A message over MAX_MESSAGE_BYTES is then rejected before it is
 *     decoded or queued.
 *   - Summaries carry only format-checked fields: `dateutc` must be the EcoWitt
 *     `YYYY-MM-DD HH:MM:SS` form or the message is rejected. Free-form upload
 *     strings such as `stationtype` are never echoed.
 *   - EcoWitt ingest is dry-run only until the gates in
 *     docs/ecowitt-future-real-ingest-gates.md are cleared by the owner.
 *     `--live` is the tool for the canary and for ingest after that; it is
 *     not an approval.
 *
 * Hard safety rules (enforced by src/test/ecowitt-ingest-forwarder-safety.test.ts):
 *   - No Supabase SDK import. No service_role. No direct DB writes.
 *   - No Action Queue writes. No alert creation. No automation. No device control.
 *   - Never logs PASSKEY, MAC, the bridge token, or MQTT credentials. Writes no files.
 *   - Only ever POSTs to the approved `ecowitt-ingest` URL, and only with
 *     `--live`. An accepted live POST asks that edge function to persist
 *     sensor_readings and bridge-token usage; the forwarder itself has no
 *     database access.
 *
 * CLI flags:
 *   --live             POST to ECOWITT_INGEST_URL. Default is dry-run: it still connects to
 *                      the MQTT broker and subscribes, but never sends the ingest POST.
 *   --once             Handle one message, then exit (0 = forwarded/accepted or dry-run; 1 otherwise).
 *   --topic <t>        MQTT topic (default ecowitt/grow or ECOWITT_MQTT_TOPIC).
 *   --mqtt-url <url>   Broker (default mqtt://127.0.0.1:1883 or ECOWITT_MQTT_URL).
 *   Any other argument, a repeated flag, or a value flag without a non-empty
 *   value is refused before any connection.
 *
 * Env:
 *   ECOWITT_INGEST_URL     https://<project-ref>.supabase.co/functions/v1/ecowitt-ingest (live only)
 *   VERDANT_BRIDGE_TOKEN   vbt_... bridge token scoped to the target tent(s) (live only)
 *   ECOWITT_MQTT_USERNAME / ECOWITT_MQTT_PASSWORD   optional broker credentials
 */

import { Duplex } from "node:stream";

export const DEFAULT_MQTT_URL = "mqtt://127.0.0.1:1883";
export const DEFAULT_MQTT_TOPIC = "ecowitt/grow";
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
/**
 * The largest MQTT packet the stream guard lets through to the parser: one
 * MAX_MESSAGE_BYTES payload plus room for its fixed header, topic and packet id.
 */
export const MAX_INBOUND_PACKET_BYTES = MAX_MESSAGE_BYTES + 1024;
/** MQTT 5 reason codes the guard reports; numeric, so the lifecycle treats them as terminal. */
export const GUARD_PACKET_TOO_LARGE = 149;
export const GUARD_MALFORMED_PACKET = 129;
/** Summary strings copied from the payload are capped before they are logged. */
export const MAX_SUMMARY_STRING = 64;
/** The ingest response is read up to this many bytes; a longer body is cancelled. */
export const MAX_RESPONSE_BYTES = 16 * 1024;
/** The dropped-reason aggregate names at most this many channel keys. */
export const MAX_DROPPED_CHANNELS = 16;
/** Live POST timeout and Full Jitter retry policy (docs/bridge-client-retry-guidance.md §4). */
export const LIVE_REQUEST_TIMEOUT_MS = 15_000;
export const LIVE_RETRY_POLICY = { maxRetries: 4, baseDelayMs: 3_000, maxDelayMs: 45_000 } as const;
/** `--once` gives the broker this long to connect before exiting nonzero. */
export const MQTT_CONNECT_TIMEOUT_MS = 20_000;

/** Keys the HTTP bridge wraps around the gateway payload; not gateway fields. */
const BRIDGE_WRAPPER_KEYS = new Set(["received_at", "transport", "topic"]);
/** Never logged. */
const SECRET_KEY_RE = /passkey|^mac$|token|secret|password|api_key|application_key|app_key/i;
// The same keys `supabase/functions/_shared/ecowittChannelTentRouter.ts` routes:
// `temp{n}f` and `humidity{n}` for air, `soilmoisture{n}` for soil. Anything else
// (`temp2`, `humidity3f`) is not a channel, so the dry-run summary never claims
// one that live ingest would not read (Codex P2 on #2335 at 3df0e691).
const AIR_TEMP_F_RE = /^temp([1-8])f$/i;
const AIR_HUMIDITY_RE = /^humidity([1-8])$/i;
const SOIL_CHANNEL_RE = /^soilmoisture([1-8])$/i;
/** The only `dateutc` form `ecowitt-ingest` accepts (`parseEcoWittDateUtc`). */
const DATEUTC_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
/** Mirrors `ECOWITT_DATEUTC_MIN_ISO` / `_FUTURE_SKEW_MS` in ecowittRoutedRowBuilder.ts. */
const DATEUTC_MIN_MS = Date.parse("2020-01-01T00:00:00.000Z");
const DATEUTC_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * True only for a `dateutc` production `parseEcoWittDateUtc` accepts: the
 * EcoWitt shape, a real calendar date (no 2026-02-30), and inside its clock
 * window. A parity test pins this against the production parser (Codex P2 on
 * #2335 at 95f5dfe7).
 */
export function dateutcAccepted(dateutc: string, now: Date = new Date()): boolean {
  const m = DATEUTC_RE.exec(dateutc);
  if (!m) return false;
  const [, y, mo, d, h, mi, sec] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}.000Z`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== iso) return false;
  return t >= DATEUTC_MIN_MS && t <= now.getTime() + DATEUTC_FUTURE_SKEW_MS;
}

export interface ForwarderFlags {
  live: boolean;
  once: boolean;
  topic: string;
  mqttUrl: string;
}

export interface ForwarderEnv {
  ingestUrl: string | null;
  token: string | null;
  mqttUsername: string | null;
  mqttPassword: string | null;
}

const BOOLEAN_FLAGS = new Set(["--live", "--once"]);
const VALUE_FLAGS = new Set(["--topic", "--mqtt-url"]);

/**
 * Pure. Reads argv in order and throws on anything it does not recognise, so a
 * malformed invocation never reaches the broker: an unknown argument
 * (`unknown_option:argument_<n>`), a repeated flag (`duplicate_option:<flag>`),
 * or a value flag that is last, followed by another option
 * (`missing_option_value:<flag>`) or given an empty value
 * (`empty_option_value:<flag>`) (Codex P2 on #2335 at acab6b12 and bae4ae77).
 * An unknown argument is named by position only: `--password=…` must never be
 * echoed (Codex P1 at ed548103). `<flag>` is always one of the known flags.
 * A bare `--` separator is skipped. Blank env values count as unset.
 */
export function parseFlags(argv: readonly string[], env: NodeJS.ProcessEnv): ForwarderFlags {
  const seen = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!BOOLEAN_FLAGS.has(arg) && !VALUE_FLAGS.has(arg)) {
      throw new Error(`unknown_option:argument_${i + 1}`);
    }
    if (seen.has(arg)) throw new Error(`duplicate_option:${arg}`);
    seen.add(arg);
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing_option_value:${arg}`);
      }
      if (!value.trim()) throw new Error(`empty_option_value:${arg}`);
      values.set(arg, value);
      i += 1;
    }
  }
  return {
    live: seen.has("--live"),
    once: seen.has("--once"),
    topic: values.get("--topic") ?? (env.ECOWITT_MQTT_TOPIC?.trim() || DEFAULT_MQTT_TOPIC),
    mqttUrl: values.get("--mqtt-url") ?? (env.ECOWITT_MQTT_URL?.trim() || DEFAULT_MQTT_URL),
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
export function prepareForwardPayload(text: string, now: Date = new Date()): PreparedPayload {
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
  // Message-scoped: this upload's PASSKEY, whatever its length or shape, is
  // checked against this upload's own fields only, case-insensitively. Nothing
  // is remembered across messages, so one frame cannot change how a later
  // frame is judged (Codex P1 on #2335 at bae4ae77).
  const passkeyLower = passkey.trim().toLowerCase();
  const echoesPasskey = (value: string) => value.toLowerCase().includes(passkeyLower);
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
  if (echoesPasskey(dateutcRaw)) return { ok: false, reason: "invalid_dateutc" };
  const dateutc = dateutcRaw.trim();
  if (!dateutc) return { ok: false, reason: "missing_dateutc" };
  // Only the EcoWitt form `ecowitt-ingest` itself accepts
  // (parseEcoWittDateUtc). A free-form value could carry any encoding of a
  // secret, so it is refused here rather than echoed (Codex P1 at bae4ae77).
  if (!dateutcAccepted(dateutc, now)) return { ok: false, reason: "invalid_dateutc" };

  const air = new Set<number>();
  const soil = new Set<number>();
  for (const k of Object.keys(payload)) {
    const a = AIR_TEMP_F_RE.exec(k) ?? AIR_HUMIDITY_RE.exec(k);
    if (a) air.add(Number(a[1]));
    const s = SOIL_CHANNEL_RE.exec(k);
    if (s) soil.add(Number(s[1]));
  }
  return {
    ok: true,
    payload,
    summary: {
      air_channels: [...air].sort((x, y) => x - y),
      soil_channels: [...soil].sort((x, y) => x - y),
      key_count: Object.keys(payload).length,
      dateutc,
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

export interface DroppedSummary {
  /** Count per documented router reason code; anything else counts as `other`. */
  reasons: Record<string, number>;
  /** Router channel keys (`temp{n}f`, `humidity{n}`, `soilmoisture{n}`) that were dropped. */
  channels: string[];
}

export interface ResponseSummary {
  status: number;
  accepted: boolean | null;
  inserted: number | null;
  skipped_duplicate: number | null;
  reason: string | null;
  dropped: DroppedSummary | null;
}

/** The reason codes `ecowittChannelTentRouter` puts in `dropped[]`. */
const DROPPED_REASON_CODES = new Set([
  "no_passkey_in_payload",
  "fingerprint_mismatch",
  "channel_value_missing_or_invalid",
  "channel_value_out_of_plausible_range",
  "no_eligible_tent_for_channel",
]);
const ROUTER_CHANNEL_KEY_RE = /^(?:temp[1-8]f|humidity[1-8]|soilmoisture[1-8])$/i;
/** A reason or error code: lower-case words, never free text. */
const RESPONSE_CODE_RE = /^[a-z0-9_]{1,64}$/;

/**
 * Pure. Why an upload stored nothing lives only in `dropped[]` (Codex P2 on
 * #2335 at acab6b12): keep a count per documented reason code and the router
 * channel keys involved. Tenant ids, metrics and any other text are never copied.
 */
function summarizeDropped(value: unknown): DroppedSummary | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const reasons: Record<string, number> = {};
  const channels = new Set<string>();
  for (const entry of value.slice(0, 256)) {
    if (!entry || typeof entry !== "object") continue;
    const { reason, channel_key: channelKey } = entry as Record<string, unknown>;
    const code = typeof reason === "string" && DROPPED_REASON_CODES.has(reason) ? reason : "other";
    reasons[code] = (reasons[code] ?? 0) + 1;
    if (typeof channelKey === "string" && ROUTER_CHANNEL_KEY_RE.test(channelKey)) {
      channels.add(channelKey.toLowerCase());
    }
  }
  return { reasons, channels: [...channels].sort().slice(0, MAX_DROPPED_CHANNELS) };
}

/**
 * Pure. Keeps only the documented response fields; never echoes the body.
 * `bodyText` is null when the body exceeded MAX_RESPONSE_BYTES.
 */
export function summarizeResponse(status: number, bodyText: string | null): ResponseSummary {
  let body: Record<string, unknown> = {};
  if (bodyText !== null) {
    try {
      const v = JSON.parse(bodyText);
      if (v && typeof v === "object" && !Array.isArray(v)) body = v as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const code = (v: unknown) => (typeof v === "string" && RESPONSE_CODE_RE.test(v) ? v : null);
  return {
    status,
    accepted: typeof body.accepted === "boolean" ? body.accepted : null,
    inserted: num(body.inserted),
    skipped_duplicate: num(body.skipped_duplicate),
    reason: bodyText === null ? "response_too_large" : (code(body.reason) ?? code(body.error)),
    dropped: summarizeDropped(body.dropped),
  };
}

/**
 * Reads at most `maxBytes` of a response body and cancels the rest, so a large
 * or endless body is never buffered whole (Codex P2 on #2335 at acab6b12 and
 * bae4ae77). Returns null when the body is longer than `maxBytes`.
 */
export async function readBoundedText(
  response: Response,
  maxBytes: number = MAX_RESPONSE_BYTES,
): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
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
 * The MQTT username and password this run was configured with (environment
 * or broker URL userinfo). They are scrubbed from every log line literally,
 * case-insensitively and URI-encoded, at any length: over-redacting ordinary
 * text in a log is harmless (Codex P1 on #2335 at acab6b12 and bae4ae77).
 * Upload PASSKEYs are never stored here; they are checked per message.
 */
const configuredSecrets = new Set<string>();

/** Replaces the configured credential set. Called once by `main`. */
export function setConfiguredSecrets(values: readonly string[]): void {
  configuredSecrets.clear();
  for (const value of values) {
    if (!value) continue;
    configuredSecrets.add(value);
    const encoded = encodeURIComponent(value);
    if (encoded !== value) configuredSecrets.add(encoded);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Marks every occurrence of every configured value, overlapping ones included,
 * then replaces each merged run once. Replacing one value at a time let a
 * shorter value that prefixes a longer one (username `mqtt-user`, password
 * `mqtt-user-password`) cut the longer one first and leak its tail
 * (Codex P1 on #2335 at ac8be57b).
 */
function redactConfiguredSecrets(value: string): string {
  if (configuredSecrets.size === 0 || value.length === 0) return value;
  const covered = new Uint8Array(value.length);
  for (const secret of configuredSecrets) {
    const re = new RegExp(escapeRegExp(secret), "gi");
    for (let m = re.exec(value); m !== null; m = re.exec(value)) {
      covered.fill(1, m.index, m.index + m[0].length);
      re.lastIndex = m.index + 1;
    }
  }
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (!covered[i]) {
      out += value[i++];
      continue;
    }
    while (i < value.length && covered[i]) i++;
    out += "(redacted)";
  }
  return out;
}

/** Redacts configured credentials, credential shapes and URL credentials inside one string. */
export function redactString(value: string): string {
  return redactConfiguredSecrets(value)
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
      const response = summarizeResponse(r.status, await readBoundedText(r));
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
function messageJob(
  deps: MessageHandlerDeps,
  payload: Buffer | string,
  finish: Finish,
): () => Promise<void> {
  return async () => {
    let outcome: ForwardOutcome | null = null;
    try {
      outcome = await handleMessage({
        // Decoded only once the runner starts the job, never for a frame the
        // full backlog drops (Codex P2 on #2335 at 95f5dfe7).
        text: typeof payload === "string" ? payload : payload.toString("utf8"),
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
 * bounded runner, so a burst never fans out into unbounded concurrent POSTs or
 * retries (Codex P2 at 0676e200 and efeae597).
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
        : messageJob(deps, buf, finish);
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
  end?(): unknown;
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
  // Bumped on every connect and on close/offline, so a SUBACK callback from a
  // connection that has since dropped cannot clear or trip the new deadline.
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
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
      if (timer) clearTimeout(timer);
      deps.onFatal(2);
    }
  };
  const timeoutMs = deps.connectTimeoutMs ?? MQTT_CONNECT_TIMEOUT_MS;
  // One deadline covers both CONNACK and SUBACK in `--once` mode: the
  // client's connectTimeout waits only for CONNACK, and a broker that accepts
  // the connection but never answers the subscription would otherwise hang
  // the run forever (Codex P2 on #2335 at 3c16b6a4). Continuous mode keeps
  // reconnecting until CONNACK, but each connection gets the same deadline for
  // its SUBACK; a missing SUBACK is terminal there too (Codex P2 at bae4ae77).
  const armDeadline = () => {
    if (timer || ended) return;
    timer = setTimeout(() => {
      timer = null;
      fatal(connected ? "subscribe_timeout" : "connect_timeout", { timeout_ms: timeoutMs }, true);
    }, timeoutMs);
  };
  if (deps.flags.once) armDeadline();
  client.on("connect", () => {
    connected = true;
    const gen = ++generation;
    armDeadline();
    client.subscribe(deps.flags.topic, (err, granted) => {
      if (gen !== generation) return;
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
      timer = null;
      log("subscribed", { topic: deps.flags.topic });
    });
  });
  // MQTT.js reports a refused CONNACK (bad credentials, not authorised) and an
  // oversized packet as an error with a numeric reason code, and does not
  // reconnect after either; network errors carry string codes and are retried.
  // A numeric code is therefore terminal in every mode (Codex P2 at bae4ae77).
  client.on("error", (e: Error & { code?: unknown }) =>
    fatal("mqtt_error", { error: e.message }, typeof e.code === "number"),
  );
  // A broker disconnect in `--once` mode has nothing to reconnect for
  // (reconnectPeriod is 0): end the run instead of idling until the connect
  // timer, or forever once connected (Codex P2 on #2335 at 0676e200). After
  // the one message is claimed `fatal` only logs. Continuous mode logs the
  // event and leaves the client's own reconnect to it.
  for (const event of ["close", "offline"] as const) {
    client.on(event, () => {
      if (deps.flags.once) return fatal(`mqtt_${event}`);
      // A connection lost before its SUBACK must not leave its deadline armed:
      // the next connect would inherit only the time left (Codex P1 at 95f5dfe7).
      connected = false;
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      log(`mqtt_${event}`, { reconnecting: true });
    });
  }
}

export interface GuardViolation {
  code: number;
  reason: "packet_too_large" | "malformed_remaining_length";
  declaredBytes?: number;
}

/**
 * Pure apart from its own counters. Walks the MQTT fixed header of every
 * packet in the inbound byte stream - one type byte, a 1-4 byte remaining
 * length, then the body - and reports the first packet that declares more
 * than `maxPacketBytes` in total, or whose remaining length runs past four
 * bytes. It decides from the header alone, so no body is held to decide.
 */
export function createInboundPacketScanner(
  maxPacketBytes: number,
): (chunk: Uint8Array) => GuardViolation | null {
  let phase: "type" | "length" | "body" = "type";
  let length = 0;
  let multiplier = 1;
  let lengthBytes = 0;
  let bodyLeft = 0;
  return (chunk) => {
    let i = 0;
    while (i < chunk.length) {
      if (phase === "body") {
        const take = Math.min(bodyLeft, chunk.length - i);
        bodyLeft -= take;
        i += take;
        if (bodyLeft === 0) phase = "type";
        continue;
      }
      const byte = chunk[i++];
      if (phase === "type") {
        phase = "length";
        length = 0;
        multiplier = 1;
        lengthBytes = 0;
        continue;
      }
      length += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      lengthBytes += 1;
      if (byte & 0x80) {
        if (lengthBytes === 4) {
          return { code: GUARD_MALFORMED_PACKET, reason: "malformed_remaining_length" };
        }
        continue;
      }
      const declaredBytes = 1 + lengthBytes + length;
      if (declaredBytes > maxPacketBytes) {
        return { code: GUARD_PACKET_TOO_LARGE, reason: "packet_too_large", declaredBytes };
      }
      bodyLeft = length;
      phase = length === 0 ? "type" : "body";
    }
    return null;
  };
}

/**
 * Wraps the broker socket so MQTT.js only ever reads bytes the scanner has
 * passed. Each socket chunk is scanned whole before it is handed on; the
 * first violation destroys both streams with an error whose numeric `code`
 * MQTT.js re-emits on the client, which `attachClientLifecycle` treats as
 * terminal. Outgoing writes go straight to the socket.
 *
 * Memory bound: the guard itself holds no data. What can sit in memory is
 * the socket's current read chunk (the runtime's read size; the guard cannot
 * shrink it), this stream's readable buffer (its 16 KiB high-water mark, then
 * the socket is paused), and the parser's one partial packet, which the guard
 * caps at `maxPacketBytes`.
 */
export function guardInboundStream(
  socket: Duplex,
  maxPacketBytes: number = MAX_INBOUND_PACKET_BYTES,
): Duplex {
  const scan = createInboundPacketScanner(maxPacketBytes);
  const guarded = new Duplex({
    read() {
      socket.resume();
    },
    write(chunk, _encoding, callback) {
      socket.write(chunk, callback);
    },
    final(callback) {
      socket.end(callback);
    },
    destroy(error, callback) {
      socket.destroy();
      callback(error);
    },
  });
  socket.on("data", (chunk: Buffer) => {
    if (guarded.destroyed) return;
    const violation = scan(chunk);
    if (violation) {
      log("mqtt_packet_refused", {
        reason: violation.reason,
        declared_bytes: violation.declaredBytes,
        limit_bytes: maxPacketBytes,
      });
      guarded.destroy(
        Object.assign(new Error(`inbound MQTT packet refused: ${violation.reason}`), {
          code: violation.code,
        }),
      );
      return;
    }
    if (!guarded.push(chunk)) socket.pause();
  });
  socket.on("end", () => guarded.push(null));
  socket.on("error", (e) => guarded.destroy(e));
  socket.on("close", () => {
    if (!guarded.destroyed) guarded.destroy();
  });
  return guarded;
}

/** Loads the optional `mqtt` package; null when it is not installed. */
async function loadMqttModule(): Promise<any> {
  try {
    return await (Function("m", "return import(m)") as any)("mqtt");
  } catch {
    return null;
  }
}

/**
 * Opens the broker connection with every transport MQTT.js builds wrapped in
 * `guardInboundStream`, on the first connect and on each reconnect. The client
 * is created with `manualConnect` so its stream builder can be wrapped before
 * the first socket opens. A client without a stream builder to wrap is refused
 * (fail closed) rather than run unguarded. `loadMqtt` exists for tests.
 */
export async function connectMqtt(
  flags: ForwarderFlags,
  env: ForwarderEnv,
  loadMqtt: () => Promise<any> = loadMqttModule,
): Promise<MqttClientLike> {
  const mqtt = await loadMqtt();
  if (!mqtt) {
    console.error("[ecowitt-forwarder] mqtt package not installed. Run `bun add --no-save mqtt`.");
    process.exit(2);
  }
  const client = mqtt.connect(flags.mqttUrl, {
    username: env.mqttUsername ?? undefined,
    password: env.mqttPassword ?? undefined,
    // One-shot runs fail fast instead of reconnecting with nothing to handle.
    reconnectPeriod: flags.once ? 0 : 5000,
    connectTimeout: MQTT_CONNECT_TIMEOUT_MS,
    manualConnect: true,
    // The lifecycle subscribes on every `connect` and needs a real SUBACK each
    // time. With MQTT.js's default `resubscribe: true` a repeat subscribe to a
    // remembered topic answers `[]` without asking the broker, which reads as
    // a refusal and ended continuous mode after an ordinary reconnect
    // (Codex P2 on #2335 at ac8be57b).
    resubscribe: false,
  });
  const buildStream = client.streamBuilder;
  if (typeof buildStream !== "function" || typeof client.connect !== "function") {
    client.end?.(true);
    throw new Error("mqtt client exposes no stream builder to guard; refusing to connect");
  }
  client.streamBuilder = (c: unknown) => guardInboundStream(buildStream(c));
  client.connect();
  return client;
}

/**
 * Pure. The credential values a run knows before any message arrives: the
 * MQTT username and password from the environment and from the broker URL's
 * userinfo, so a topic or payload that echoes them is redacted literally.
 */
export function configuredSecretValues(flags: ForwarderFlags, env: ForwarderEnv): string[] {
  const values = [env.mqttUsername, env.mqttPassword];
  let url: URL | null = null;
  try {
    url = new URL(flags.mqttUrl);
  } catch {
    // An unparseable broker URL is the MQTT client's error to report.
  }
  // Each URL credential is kept as written and, separately, decoded: one
  // malformed escape (`bad%ZZ`) must not drop the other credential or itself
  // from redaction (Codex P1 on #2335 at d344f8e4).
  for (const part of url ? [url.username, url.password] : []) {
    values.push(part);
    try {
      values.push(decodeURIComponent(part));
    } catch {
      // Not decodable: the form as written, pushed above, is what appears.
    }
  }
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

export interface MainDeps {
  /** Opens the broker connection. Production: the `mqtt` package. */
  connect: (flags: ForwarderFlags, env: ForwarderEnv) => Promise<MqttClientLike>;
  /** Ends the process. Production: `process.exit`. */
  exit: (code: number) => void;
  fetchImpl?: typeof fetch;
}

export const PRODUCTION_DEPS: MainDeps = {
  connect: connectMqtt,
  exit: (code) => process.exit(code),
};

/**
 * Wires the run: argument and config checks, the broker connection, one
 * shared `--once` claim between the lifecycle and the message handler, and a
 * single `finish` that closes the client before exiting. `deps` exists so the
 * real wiring can be driven under test (Codex P2 on #2335 at acab6b12 and
 * bae4ae77).
 */
export async function main(
  argv: readonly string[],
  processEnv: NodeJS.ProcessEnv,
  deps: MainDeps = PRODUCTION_DEPS,
): Promise<void> {
  let flags: ForwarderFlags;
  try {
    flags = parseFlags(argv, processEnv);
  } catch (e) {
    console.error(
      `[ecowitt-forwarder] refused: ${redactString(e instanceof Error ? e.message : "bad_arguments")}. ` +
        "Flags: --live, --once, --topic <t>, --mqtt-url <url>; each at most once.",
    );
    deps.exit(2);
    return;
  }
  const env = readEnv(processEnv);
  setConfiguredSecrets(configuredSecretValues(flags, env));

  // An unparseable broker URL hides its credentials from extraction, so no
  // configuration string can be proven redacted: refuse with a value-free
  // line before anything else is logged (Codex P1 on #2335 at 95f5dfe7).
  if (!URL.canParse(flags.mqttUrl)) {
    console.error("[ecowitt-forwarder] refused: --mqtt-url is not a valid URL.");
    deps.exit(2);
    return;
  }

  if (flags.live) {
    const problems = liveConfigProblems(env);
    if (problems.length > 0) {
      console.error(
        `[ecowitt-forwarder] --live refused (fail closed): ${problems.join(", ")}. ` +
          `ECOWITT_INGEST_URL must be exactly ${APPROVED_INGEST_URLS.join(" or ")} and VERDANT_BRIDGE_TOKEN a vbt_ token.`,
      );
      deps.exit(2);
      return;
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

  let client: MqttClientLike;
  try {
    client = await deps.connect(flags, env);
  } catch {
    // MQTT.js throws ERR_INVALID_URL for a malformed broker URL with the whole
    // URL, userinfo included, in `.input`; an escaped rejection prints it. Log
    // a fixed line without the error, the URL or any field of it, and exit
    // (Codex P1 on #2335 at ac8be57b).
    log("mqtt_connect_failed");
    deps.exit(2);
    return;
  }
  const claim: OnceClaim = { claimed: false };
  const finish = (exitCode: number) => {
    client.end?.();
    deps.exit(exitCode);
  };
  attachClientLifecycle(client, { flags, claim, onFatal: finish });
  client.on(
    "message",
    createMessageHandler({ flags, env, claim, fetchImpl: deps.fetchImpl, onDone: finish }),
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

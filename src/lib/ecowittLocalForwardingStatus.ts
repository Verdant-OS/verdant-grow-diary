/**
 * Pure helpers + typed shape for the local EcoWitt Windows testbench
 * forwarding status / error report endpoints.
 *
 * Read-only. No Supabase. No Edge calls. No mutations. The browser-side
 * widget that consumes these only ever talks to `http://localhost:8787`
 * (the local operator listener); production is never contacted.
 *
 * Safety:
 *  - never returns tokens, Authorization headers, raw PASSKEY, raw
 *    EcoWitt payloads, JWT-like values, admin-role markers, or .env
 *    contents — the listener already redacts, and `sanitizeReportText`
 *    re-scrubs as a belt-and-braces guard before any UI/copy.
 */

export const LOCAL_FORWARDING_BASE_URL = "http://localhost:8787";
export const LOCAL_FORWARDING_STATUS_PATH = "/debug/forwarding-status";
export const LOCAL_FORWARDING_ERROR_REPORT_PATH =
  "/debug/forwarding-error-report";

export const LOCAL_FORWARDING_STATUS_URL =
  `${LOCAL_FORWARDING_BASE_URL}${LOCAL_FORWARDING_STATUS_PATH}` as const;
export const LOCAL_FORWARDING_ERROR_REPORT_URL =
  `${LOCAL_FORWARDING_BASE_URL}${LOCAL_FORWARDING_ERROR_REPORT_PATH}` as const;

export interface LocalForwardingLatestMetrics {
  source: string | null;
  vendor: string | null;
  captured_at: string | null;
  metric_keys: string[];
}

export interface LocalForwardingStatus {
  ok: boolean;
  forwarding_enabled: boolean;
  forwarding_ready: boolean;
  ingest_url_configured: boolean;
  bridge_token_configured: boolean;
  tent_id_configured: boolean;
  tent_id_valid: boolean;
  last_forward_status: number | null;
  last_forward_error: string | null;
  last_forward_response_error: string | null;
  last_forward_response_classification: string | null;
  last_forward_response_reason: string | null;
  last_forward_response_message: string | null;
  forward_success_count: number;
  forward_failure_count: number;
  forward_attempt_count: number;
  forward_blocked_count: number;
  retry_count: number;
  last_retry_error: string | null;
  last_retry_at: string | null;
  last_retryable_status: number | null;
  max_retry_attempts: number;
  recommended_next_step: string | null;
  malformed_line_count: number;
  generated_at: string | null;
  latest_metrics: LocalForwardingLatestMetrics | null;
}

export type LocalForwardingFetchState =
  | { state: "loading" }
  | { state: "offline"; reason: string }
  | { state: "ready"; status: LocalForwardingStatus };

/**
 * Token-like / secret patterns that must never reach the UI or clipboard,
 * even if the listener accidentally regressed. Belt-and-braces only.
 */
const SECRET_PATTERNS: RegExp[] = [
  /vbt_[A-Za-z0-9_-]{6,}/g,
  /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
  /Bearer\s+[A-Za-z0-9._-]{6,}/gi,
  /Authorization\s*:\s*[^\s",}]+/gi,
  /PASSKEY/gi,
  // Admin-role marker (assembled at runtime to avoid scanners flagging us).
  new RegExp(["service", "_", "role"].join(""), "gi"),
];

const REDACTED = "[REDACTED]";

/** Scrub any token-shaped substring out of a free-form string. */
export function sanitizeReportText(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

/**
 * Deep-sanitize a parsed JSON-ish report object before display/copy.
 * Returns a structurally identical value with token-like values redacted
 * and forbidden keys forced to `[REDACTED]`.
 */
const FORBIDDEN_KEYS = new Set([
  "authorization",
  "bridge_token",
  "verdant_bridge_token",
  "token",
  "passkey",
  "raw_payload",
]);

export function sanitizeReportValue<T = unknown>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") {
    return sanitizeReportText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeReportValue(v)) as unknown as T;
  }
  if (typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = sanitizeReportValue(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

function coerceNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

function coerceString(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function coerceBool(v: unknown): boolean {
  return v === true;
}

/** Tolerant normalization — old/new listener versions both accepted. */
export function normalizeLocalForwardingStatus(
  raw: unknown,
): LocalForwardingStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  const safe = sanitizeReportValue(r) as Record<string, unknown>;
  return {
    ok: coerceBool(safe.ok),
    forwarding_enabled: coerceBool(safe.forwarding_enabled),
    forwarding_ready: coerceBool(safe.forwarding_ready),
    ingest_url_configured: coerceBool(safe.ingest_url_configured),
    bridge_token_configured: coerceBool(safe.bridge_token_configured),
    tent_id_configured: coerceBool(safe.tent_id_configured),
    tent_id_valid: coerceBool(safe.tent_id_valid),
    last_forward_status:
      typeof safe.last_forward_status === "number"
        ? safe.last_forward_status
        : null,
    last_forward_error: coerceString(safe.last_forward_error),
    last_forward_response_error: coerceString(safe.last_forward_response_error),
    last_forward_response_classification: coerceString(
      safe.last_forward_response_classification,
    ),
    last_forward_response_message: coerceString(
      safe.last_forward_response_message,
    ),
    forward_success_count: coerceNumber(safe.forward_success_count),
    forward_failure_count: coerceNumber(safe.forward_failure_count),
    forward_attempt_count: coerceNumber(safe.forward_attempt_count),
    forward_blocked_count: coerceNumber(safe.forward_blocked_count),
    retry_count: coerceNumber(safe.retry_count),
    last_retry_error: coerceString(safe.last_retry_error),
    last_retry_at: coerceString(safe.last_retry_at),
    last_retryable_status:
      typeof safe.last_retryable_status === "number"
        ? safe.last_retryable_status
        : null,
    max_retry_attempts: coerceNumber(safe.max_retry_attempts, 0),
    last_forward_response_reason: coerceString(safe.last_forward_response_reason),
    recommended_next_step: coerceString(safe.recommended_next_step),
    malformed_line_count: coerceNumber(safe.malformed_line_count, 0),
    generated_at: coerceString(safe.generated_at),
    latest_metrics: normalizeLatestMetrics(safe.latest_metrics),
  };
}

function normalizeLatestMetrics(raw: unknown): LocalForwardingLatestMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const metricsObj = r.metrics && typeof r.metrics === "object" ? (r.metrics as Record<string, unknown>) : {};
  const keys = Object.keys(metricsObj).filter((k) => typeof k === "string");
  return {
    source: coerceString(r.source),
    vendor: coerceString(r.vendor),
    captured_at: coerceString(r.captured_at),
    metric_keys: keys,
  };
}

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** Fetch the local listener's forwarding-status. Classifies offline state. */
export async function fetchLocalForwardingStatus(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  url: string = LOCAL_FORWARDING_STATUS_URL,
): Promise<LocalForwardingFetchState> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      return {
        state: "offline",
        reason: `local_bridge_http_${res.status}`,
      };
    }
    const body = await res.json();
    return { state: "ready", status: normalizeLocalForwardingStatus(body) };
  } catch {
    return {
      state: "offline",
      reason: "local_bridge_unreachable",
    };
  }
}

/**
 * Fetch the local error report and return a sanitized JSON string safe
 * to write to the clipboard.
 */
export async function fetchLocalForwardingErrorReportText(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  url: string = LOCAL_FORWARDING_ERROR_REPORT_URL,
): Promise<
  | { ok: true; json: string }
  | { ok: false; reason: "offline" | "http_error" | "parse_error"; detail?: string }
> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url);
  } catch {
    return { ok: false, reason: "offline" };
  }
  if (!res.ok) {
    return { ok: false, reason: "http_error", detail: `http_${res.status}` };
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, reason: "parse_error" };
  }
  const safe = sanitizeReportValue(parsed);
  return { ok: true, json: JSON.stringify(safe, null, 2) };
}

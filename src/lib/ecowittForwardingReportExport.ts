/**
 * Pure helper to build the sanitized "verdant_ecowitt_forwarding_debug_report"
 * payload copied to the operator's clipboard.
 *
 * Hard rules:
 *   - Allow-list only. Unknown fields from the listener are dropped.
 *   - Metric keys are restricted to a known safe set.
 *   - Every string is deep-sanitized as a belt-and-braces guard against
 *     a listener regression that leaks tokens / Authorization / PASSKEY /
 *     raw_payload / JWT / service-role values / masked token preview /
 *     masked ingest URL. This holds on BOTH latest_metrics paths — the
 *     error-report envelope AND the status fallback — at this module's
 *     own boundary, without relying on the caller having normalized the
 *     status first (issue #1003).
 *   - Envelope fields are value/shape-allowlisted, not merely scrubbed:
 *     captured_at and generated_at must be timestamp-shaped, source must
 *     be the canonical vocabulary (unknown labels normalize to
 *     "invalid", never echoed, never live — deliberately stricter than
 *     the trust-alias table in sensorSourceRules: this report ECHOES the
 *     listener's resolved label and must never alias a provider string
 *     up to "live"), vendor must be a known first-party vendor label.
 *   - Serialization re-walks the report through the exact declared shape
 *     (recursive output allowlist) before stringifying.
 *   - No bridge token, no ingest URL (masked or otherwise), no headers,
 *     no raw request/response bodies, no DB messages, no constraint
 *     names, no SQL.
 *   - No write_action — this report describes the local bridge only.
 */

import { sanitizeReportText, type LocalForwardingStatus } from "@/lib/ecowittLocalForwardingStatus";

/** Metric keys allowed in the latest_metrics.metrics payload. */
export const ALLOWED_METRIC_KEYS = [
  "temp_f",
  "humidity_percent",
  "soil_moisture_pct",
  "co2_ppm",
] as const;

export type AllowedMetricKey = (typeof ALLOWED_METRIC_KEYS)[number];

export interface SanitizedBridgeStatus {
  forwarding_enabled: boolean;
  forwarding_ready: boolean;
  last_forward_status: number | null;
  last_forward_error: string | null;
  last_forward_response_error: string | null;
  last_forward_response_classification: string | null;
  last_forward_response_reason: string | null;
  retry_count: number;
  max_retry_attempts: number;
  last_retry_error: string | null;
  malformed_line_count: number;
  generated_at: string | null;
  recommended_next_step: string | null;
}

export interface SanitizedLatestMetrics {
  captured_at: string | null;
  source: string | null;
  vendor: string | null;
  metrics: Partial<Record<AllowedMetricKey, number>>;
}

export interface SanitizedForwardingReport {
  report_type: "verdant_ecowitt_forwarding_debug_report";
  generated_by: "verdant_operator_mode";
  copied_at: string;
  safety: {
    sanitized: true;
    raw_payload_included: false;
    secrets_included: false;
    write_action: false;
  };
  bridge_status: SanitizedBridgeStatus;
  latest_metrics: SanitizedLatestMetrics;
}

/** Optional raw "error report" body fetched from /debug/forwarding-error-report. */
export interface ForwardingErrorReportLike {
  recommended_next_step?: unknown;
  latest_metrics?: unknown;
  malformed_line_count?: unknown;
  generated_at?: unknown;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return null;
  return sanitizeReportText(v);
}

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const CANONICAL_SOURCE_LABELS: ReadonlySet<string> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

// Timestamp-shaped strings only: ISO-8601 or the listener's
// space-separated variant. An allowlisted shape structurally cannot
// carry a token, MAC, or private id.
const TIMESTAMP_SHAPE_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?$/;

// Known first-party vendor labels only — a value allowlist, per issue
// #1003's "prefer an output allowlist". A shape regex is not enough
// here: station ids embedding MAC bytes ("gw2000a-wifi4c01"),
// separator-free MACs ("accb88af4c01"), and 32-hex passkey values are
// all slug-shaped. An enumerated set excludes them structurally.
const VENDOR_LABEL_ALLOWLIST: ReadonlySet<string> = new Set([
  "ecowitt",
  "ecowitt_mqtt",
  "ecowitt_windows_testbench",
]);

function safeCapturedAt(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return TIMESTAMP_SHAPE_RE.test(trimmed) ? trimmed : null;
}

/**
 * Canonical source vocabulary or bust: a non-allowlisted label is an
 * unknown provenance claim and exports as "invalid" — never echoed,
 * never allowed to read as live (issue #1003).
 */
function safeSourceLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const lower = v.trim().toLowerCase();
  if (lower.length === 0) return null;
  return CANONICAL_SOURCE_LABELS.has(lower) ? lower : "invalid";
}

function safeVendorLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const lower = v.trim().toLowerCase();
  return VENDOR_LABEL_ALLOWLIST.has(lower) ? lower : null;
}

function pickAllowedMetrics(raw: unknown): Partial<Record<AllowedMetricKey, number>> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<AllowedMetricKey, number>> = {};
  for (const key of ALLOWED_METRIC_KEYS) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return out;
}

function buildLatestMetrics(
  status: LocalForwardingStatus,
  errorReport: ForwardingErrorReportLike | null,
): SanitizedLatestMetrics {
  // Prefer richer payload from the error report, fall back to the
  // already-normalized projection on the status response.
  const reportMetrics =
    errorReport && typeof errorReport.latest_metrics === "object"
      ? (errorReport.latest_metrics as Record<string, unknown>)
      : null;

  if (reportMetrics) {
    return {
      captured_at: safeCapturedAt(reportMetrics.captured_at),
      source: safeSourceLabel(reportMetrics.source),
      vendor: safeVendorLabel(reportMetrics.vendor),
      metrics: pickAllowedMetrics(reportMetrics.metrics),
    };
  }

  // Fallback envelope: apply the same allowlists here — this module's
  // boundary must hold even for a status object that never went through
  // normalizeLocalForwardingStatus (issue #1003).
  const lm = status.latest_metrics;
  return {
    captured_at: safeCapturedAt(lm?.captured_at),
    source: safeSourceLabel(lm?.source),
    vendor: safeVendorLabel(lm?.vendor),
    metrics: {},
  };
}

export interface BuildSanitizedForwardingReportInput {
  status: LocalForwardingStatus;
  errorReport?: ForwardingErrorReportLike | null;
  recommendedNextStep?: string | null;
  nowIso?: string;
}

export function buildSanitizedForwardingReport(
  input: BuildSanitizedForwardingReportInput,
): SanitizedForwardingReport {
  const { status, errorReport = null, recommendedNextStep = null, nowIso } = input;

  const recommended =
    safeString(recommendedNextStep) ??
    safeString(errorReport?.recommended_next_step) ??
    safeString(status.recommended_next_step);

  const bridge_status: SanitizedBridgeStatus = {
    forwarding_enabled: status.forwarding_enabled === true,
    forwarding_ready: status.forwarding_ready === true,
    last_forward_status:
      typeof status.last_forward_status === "number" ? status.last_forward_status : null,
    last_forward_error: safeString(status.last_forward_error),
    last_forward_response_error: safeString(status.last_forward_response_error),
    last_forward_response_classification: safeString(status.last_forward_response_classification),
    last_forward_response_reason: safeString(status.last_forward_response_reason),
    retry_count: safeNumber(status.retry_count),
    max_retry_attempts: safeNumber(status.max_retry_attempts),
    last_retry_error: safeString(status.last_retry_error),
    malformed_line_count: safeNumber(
      errorReport?.malformed_line_count ?? status.malformed_line_count,
    ),
    generated_at: safeCapturedAt(errorReport?.generated_at) ?? safeCapturedAt(status.generated_at),
    recommended_next_step: recommended,
  };

  return {
    report_type: "verdant_ecowitt_forwarding_debug_report",
    generated_by: "verdant_operator_mode",
    copied_at: nowIso ?? new Date().toISOString(),
    safety: {
      sanitized: true,
      raw_payload_included: false,
      secrets_included: false,
      write_action: false,
    },
    bridge_status,
    latest_metrics: buildLatestMetrics(status, errorReport),
  };
}

/**
 * Recursive output allowlist applied at the serialization boundary:
 * rebuilds the report as exactly the declared shape — every declared
 * key present (nulls included), every string re-scrubbed, numbers
 * finite-or-null, safety flags literal — so fields injected onto the
 * object after build can never reach the clipboard (issue #1003).
 */
function pruneReportForSerialization(report: SanitizedForwardingReport): SanitizedForwardingReport {
  const bs = report.bridge_status ?? ({} as SanitizedBridgeStatus);
  const lm = report.latest_metrics ?? ({} as SanitizedLatestMetrics);
  return {
    report_type: "verdant_ecowitt_forwarding_debug_report",
    generated_by: "verdant_operator_mode",
    copied_at: safeCapturedAt(report.copied_at) ?? "",
    safety: {
      sanitized: true,
      raw_payload_included: false,
      secrets_included: false,
      write_action: false,
    },
    bridge_status: {
      forwarding_enabled: bs.forwarding_enabled === true,
      forwarding_ready: bs.forwarding_ready === true,
      last_forward_status:
        typeof bs.last_forward_status === "number" && Number.isFinite(bs.last_forward_status)
          ? bs.last_forward_status
          : null,
      last_forward_error: safeString(bs.last_forward_error),
      last_forward_response_error: safeString(bs.last_forward_response_error),
      last_forward_response_classification: safeString(bs.last_forward_response_classification),
      last_forward_response_reason: safeString(bs.last_forward_response_reason),
      retry_count: safeNumber(bs.retry_count),
      max_retry_attempts: safeNumber(bs.max_retry_attempts),
      last_retry_error: safeString(bs.last_retry_error),
      malformed_line_count: safeNumber(bs.malformed_line_count),
      generated_at: safeCapturedAt(bs.generated_at),
      recommended_next_step: safeString(bs.recommended_next_step),
    },
    latest_metrics: {
      captured_at: safeCapturedAt(lm.captured_at),
      source: safeSourceLabel(lm.source),
      vendor: safeVendorLabel(lm.vendor),
      metrics: pickAllowedMetrics(lm.metrics),
    },
  };
}

/** JSON-stringify with stable indentation for clipboard writes — always
 * through the recursive output allowlist above. */
export function serializeSanitizedForwardingReport(report: SanitizedForwardingReport): string {
  return JSON.stringify(pruneReportForSerialization(report), null, 2);
}

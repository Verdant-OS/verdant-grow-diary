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
 *     masked ingest URL.
 *   - No bridge token, no ingest URL (masked or otherwise), no headers,
 *     no raw request/response bodies, no DB messages, no constraint
 *     names, no SQL.
 *   - No write_action — this report describes the local bridge only.
 */

import {
  sanitizeReportText,
  type LocalForwardingStatus,
} from "@/lib/ecowittLocalForwardingStatus";

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
      captured_at: safeString(reportMetrics.captured_at),
      source: safeString(reportMetrics.source),
      vendor: safeString(reportMetrics.vendor),
      metrics: pickAllowedMetrics(reportMetrics.metrics),
    };
  }

  const lm = status.latest_metrics;
  return {
    captured_at: lm?.captured_at ?? null,
    source: lm?.source ?? null,
    vendor: lm?.vendor ?? null,
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
      typeof status.last_forward_status === "number"
        ? status.last_forward_status
        : null,
    last_forward_error: safeString(status.last_forward_error),
    last_forward_response_error: safeString(status.last_forward_response_error),
    last_forward_response_classification: safeString(
      status.last_forward_response_classification,
    ),
    last_forward_response_reason: safeString(status.last_forward_response_reason),
    retry_count: safeNumber(status.retry_count),
    max_retry_attempts: safeNumber(status.max_retry_attempts),
    last_retry_error: safeString(status.last_retry_error),
    malformed_line_count: safeNumber(
      errorReport?.malformed_line_count ?? status.malformed_line_count,
    ),
    generated_at:
      safeString(errorReport?.generated_at) ?? safeString(status.generated_at),
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

/** Convenience: JSON-stringify with stable indentation for clipboard writes. */
export function serializeSanitizedForwardingReport(
  report: SanitizedForwardingReport,
): string {
  return JSON.stringify(report, null, 2);
}

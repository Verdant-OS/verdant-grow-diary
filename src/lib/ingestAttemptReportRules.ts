/**
 * ingestAttemptReportRules — pure presenter rules for the developer/
 * operator "ingest attempt report" surface.
 *
 * No I/O. No React. No Supabase. The report panel and CLI runner both
 * use this module so the same redaction + classification logic governs
 * every place a bridge token or payload preview could be displayed.
 *
 * Hard rules:
 *   - Tokens are never returned in plaintext.
 *   - Demo/stale/invalid attempts are never described as "live" / "healthy".
 *   - Nothing here calls fetch, writes a DB row, or queues an action.
 */

import { redactBridgeToken } from "@/lib/ecowittLocalTestPayloadRules";
import type { EcowittIngestEvidence } from "@/lib/ecowittMqttIngestRules";

export type IngestAttemptStatus =
  | "accepted"
  | "rejected"
  | "dry_run"
  | "network_error"
  | "unknown_response";

export type IngestAttemptClassification =
  | "accepted"
  | "invalid_payload"
  | "stale_reading"
  | "invalid_metric"
  | "missing_required_field"
  | "auth_failed"
  | "forbidden"
  | "network_error"
  | "timeout"
  | "dry_run"
  | "unknown";

export type IngestRejectionReason =
  | "missing_tent_id"
  | "missing_captured_at"
  | "no_valid_metrics"
  | "future_timestamp"
  | "stale_timestamp"
  | "invalid_humidity"
  | "invalid_temperature"
  | "invalid_soil_moisture"
  | "invalid_co2"
  | "bridge_token_rejected"
  | "forbidden_tent"
  | "malformed_response"
  | "network_unreachable"
  | "request_timeout";

export interface IngestAttemptInput {
  /** The configured ingest URL (developer-visible, no secret value). */
  url: string | null | undefined;
  /** Bridge token candidate — never returned in plaintext. */
  token: string | null | undefined;
  /** Tent UUID (developer-visible). */
  tentId?: string | null;
  /** Optional plant id, metadata only. */
  plantId?: string | null;
  /** Pre-classified normalizer result reasons (e.g. ["stale_reading"]). */
  normalizerReasons?: readonly string[];
  /** Compact metric keys present after normalization. */
  metricKeys?: readonly string[];
  /** True when no fetch was made (dry-run or normalizer rejected). */
  dryRun?: boolean;
  /** HTTP response if the request was sent. */
  response?: {
    status: number;
    body?: string | null;
  } | null;
  /** Caught exception message if the fetch threw. */
  networkError?: string | null;
  /** Optional redacted evidence built from the consumed MQTT payload. */
  evidence?: EcowittIngestEvidence | null;
}

export interface IngestAttemptReport {
  status: IngestAttemptStatus;
  classification: IngestAttemptClassification;
  httpStatus: number | null;
  reasons: IngestRejectionReason[];
  /** Short human chips for the panel. */
  chips: string[];
  /** Redacted authorization header preview, e.g. "Bearer vbt_…(redacted, len=24)". */
  authPreview: string;
  /** Developer-visible URL (never includes the token). */
  url: string | null;
  /** Developer-visible tent id (callers already see it). */
  tentId: string | null;
  /** Optional plant id. */
  plantId: string | null;
  /** Compact metric keys; never raw values. */
  metricKeys: string[];
  /** Title for the panel. */
  title: string;
  /** Single-sentence trust copy. */
  description: string;
  /** Footer copy that must always read "Nothing was stored…". */
  storageNotice: string;
  /** True when the attempt may safely be shown as healthy live evidence. */
  trustedLive: boolean;
  /** Redacted evidence from the consumed payload, if available. */
  evidence: EcowittIngestEvidence | null;
}

const TITLE: Record<IngestAttemptStatus, string> = {
  accepted: "Accepted by Verdant ingest",
  rejected: "Rejected by Verdant ingest",
  dry_run: "Dry run — nothing was sent",
  network_error: "Network error reaching Verdant ingest",
  unknown_response: "Unknown response from Verdant ingest",
};

const DESCRIPTION: Record<IngestAttemptStatus, string> = {
  accepted: "Verdant accepted this reading through the validated ingest webhook.",
  rejected: "Verdant rejected this payload. See reasons below.",
  dry_run: "Payload was normalized and previewed locally. No network call was made.",
  network_error: "The runner could not reach the ingest URL. Retry once the network is reachable.",
  unknown_response: "Verdant returned a response shape the runner did not recognize.",
};

const STORAGE_NOTICE =
  "Nothing was stored by this report panel. Persistence is the ingest webhook's job.";

function classifyHttp(status: number, body: string | null | undefined): {
  classification: IngestAttemptClassification;
  reasons: IngestRejectionReason[];
} {
  const b = (body ?? "").toLowerCase();
  if (status >= 200 && status < 300) return { classification: "accepted", reasons: [] };
  if (status === 401) return { classification: "auth_failed", reasons: ["bridge_token_rejected"] };
  if (status === 403) return { classification: "forbidden", reasons: ["forbidden_tent"] };
  if (status === 408 || status === 504)
    return { classification: "timeout", reasons: ["request_timeout"] };

  const reasons: IngestRejectionReason[] = [];
  let cls: IngestAttemptClassification = "invalid_payload";

  if (b.includes("stale")) {
    cls = "stale_reading";
    reasons.push("stale_timestamp");
  } else if (b.includes("future")) {
    reasons.push("future_timestamp");
  }
  if (b.includes("captured_at")) reasons.push("missing_captured_at");
  if (b.includes("tent_id") || b.includes("tent id")) reasons.push("missing_tent_id");
  if (b.includes("humidity")) {
    cls = cls === "stale_reading" ? cls : "invalid_metric";
    reasons.push("invalid_humidity");
  }
  if (b.includes("temp")) {
    cls = cls === "stale_reading" ? cls : "invalid_metric";
    reasons.push("invalid_temperature");
  }
  if (b.includes("co2") || b.includes("co₂")) {
    cls = cls === "stale_reading" ? cls : "invalid_metric";
    reasons.push("invalid_co2");
  }
  if (b.includes("soil")) {
    cls = cls === "stale_reading" ? cls : "invalid_metric";
    reasons.push("invalid_soil_moisture");
  }
  if (b.includes("no valid metric") || b.includes("no_valid_metrics")) {
    reasons.push("no_valid_metrics");
    cls = "missing_required_field";
  }
  return { classification: cls, reasons };
}

function classifyNormalizerReasons(
  reasons: readonly string[],
): { classification: IngestAttemptClassification; rejection: IngestRejectionReason[] } {
  const out: IngestRejectionReason[] = [];
  let cls: IngestAttemptClassification = "invalid_payload";
  for (const r of reasons) {
    switch (r) {
      case "stale_reading":
        out.push("stale_timestamp");
        cls = "stale_reading";
        break;
      case "missing_captured_at":
        out.push("missing_captured_at");
        cls = "missing_required_field";
        break;
      case "malformed_payload":
        cls = "invalid_payload";
        break;
      case "invalid_temp":
        out.push("invalid_temperature");
        cls = cls === "stale_reading" ? cls : "invalid_metric";
        break;
      case "invalid_rh":
        out.push("invalid_humidity");
        cls = cls === "stale_reading" ? cls : "invalid_metric";
        break;
      case "invalid_soil_moisture":
        out.push("invalid_soil_moisture");
        cls = cls === "stale_reading" ? cls : "invalid_metric";
        break;
      case "invalid_co2":
        out.push("invalid_co2");
        cls = cls === "stale_reading" ? cls : "invalid_metric";
        break;
      default:
        break;
    }
  }
  return { classification: cls, rejection: out };
}

export function buildIngestAttemptReport(
  input: IngestAttemptInput,
): IngestAttemptReport {
  const tokenLabel = redactBridgeToken(input.token ?? null);
  const authPreview = `Bearer ${tokenLabel}`;
  const normalizerReasons = input.normalizerReasons ?? [];
  const hasNormalizerReject = normalizerReasons.length > 0;

  let status: IngestAttemptStatus;
  let classification: IngestAttemptClassification;
  let reasons: IngestRejectionReason[] = [];
  let httpStatus: number | null = null;

  if (input.dryRun) {
    status = "dry_run";
    classification = "dry_run";
    const fromNorm = classifyNormalizerReasons(normalizerReasons);
    reasons = fromNorm.rejection;
  } else if (input.networkError) {
    status = "network_error";
    classification = "network_error";
    reasons = ["network_unreachable"];
  } else if (input.response) {
    httpStatus = input.response.status;
    const http = classifyHttp(input.response.status, input.response.body ?? null);
    classification = http.classification;
    reasons = http.reasons;
    if (http.classification === "accepted") {
      status = "accepted";
    } else {
      status = "rejected";
    }
  } else {
    status = "unknown_response";
    classification = "unknown";
  }

  // Normalizer rejections always override "accepted" — defense in depth.
  if (hasNormalizerReject && status !== "dry_run") {
    const norm = classifyNormalizerReasons(normalizerReasons);
    if (classification === "accepted") {
      status = "rejected";
    }
    classification = norm.classification;
    // Merge reasons uniquely.
    for (const r of norm.rejection) {
      if (!reasons.includes(r)) reasons.push(r);
    }
  }

  const chips: string[] = [];
  if (httpStatus !== null) chips.push(`HTTP ${httpStatus}`);
  chips.push(classification.replace(/_/g, " "));
  if (reasons.length > 0) {
    for (const r of reasons) chips.push(r.replace(/_/g, " "));
  }

  const trustedLive = classification === "accepted" && reasons.length === 0;

  return {
    status,
    classification,
    httpStatus,
    reasons,
    chips,
    authPreview,
    url: input.url ?? null,
    tentId: input.tentId ?? null,
    plantId: input.plantId ?? null,
    metricKeys: [...(input.metricKeys ?? [])],
    title: TITLE[status],
    description: DESCRIPTION[status],
    storageNotice: STORAGE_NOTICE,
    trustedLive,
  };
}

/**
 * Build a small JSON-safe object suitable for clipboard copy. Never
 * includes the raw token or raw_payload dump.
 */
export function buildRedactedReportForClipboard(
  report: IngestAttemptReport,
): Record<string, unknown> {
  return {
    status: report.status,
    classification: report.classification,
    http_status: report.httpStatus,
    reasons: report.reasons,
    url: report.url,
    tent_id: report.tentId,
    plant_id: report.plantId,
    metric_keys: report.metricKeys,
    auth: report.authPreview,
    note: report.storageNotice,
  };
}

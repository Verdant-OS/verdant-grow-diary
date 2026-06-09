/**
 * ingestAttemptLocalDiagnosticsRules — pure, browser-safe rules for
 * importing / aggregating local Ecowitt bridge ingest reports.
 *
 * The local runner can write a redacted JSON report; an operator can
 * paste it into the bridge status page. This module:
 *   - Validates the pasted JSON.
 *   - Re-redacts any token-like values defensively.
 *   - Strips raw payloads.
 *   - Aggregates accepted / rejected / dry_run / network_error counts.
 *
 * No I/O. No React. No Supabase. No DB writes.
 */

import { redactBridgeToken } from "@/lib/ecowittLocalTestPayloadRules";
import type {
  IngestAttemptClassification,
  IngestAttemptStatus,
  IngestRejectionReason,
} from "@/lib/ingestAttemptReportRules";

export interface LocalIngestAttempt {
  importedAt: string;
  status: IngestAttemptStatus;
  classification: IngestAttemptClassification;
  httpStatus: number | null;
  reasons: IngestRejectionReason[];
  url: string | null;
  tentId: string | null;
  plantId: string | null;
  metricKeys: string[];
  authPreview: string;
  transport: string | null;
  topic: string | null;
}

export interface LocalDiagnosticsSummary {
  total: number;
  accepted: number;
  rejected: number;
  dryRun: number;
  networkError: number;
  unknown: number;
  lastAttemptAt: string | null;
  lastClassification: IngestAttemptClassification | null;
  lastRejectionReason: IngestRejectionReason | null;
  lastProvider: string | null;
  lastTransport: string | null;
  lastTopic: string | null;
  lastMetricKeys: string[];
  latest: LocalIngestAttempt | null;
}

const VALID_STATUSES: ReadonlySet<IngestAttemptStatus> = new Set([
  "accepted",
  "rejected",
  "dry_run",
  "network_error",
  "unknown_response",
]);

const TOKEN_LIKE_RE = /\b(vbt_[A-Za-z0-9_-]{6,}|sk_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_\-.]{20,})\b/g;

function defensivelyRedact(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(TOKEN_LIKE_RE, (m) => redactBridgeToken(m));
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Parse + validate + redact a pasted runner report. Returns
 * `{ ok: false, reason }` on any structural problem so callers can show
 * a clear error without persisting bad data.
 */
export type ImportResult =
  | { ok: true; attempt: LocalIngestAttempt }
  | { ok: false; reason: "invalid_json" | "invalid_shape" | "token_leak_blocked" };

export function importRunnerReport(rawJson: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_shape" };
  }
  const p = parsed as Record<string, unknown>;

  const status = asString(p.status) as IngestAttemptStatus | null;
  const classification = asString(p.classification) as IngestAttemptClassification | null;
  if (!status || !VALID_STATUSES.has(status)) {
    return { ok: false, reason: "invalid_shape" };
  }
  if (!classification) {
    return { ok: false, reason: "invalid_shape" };
  }

  // Defensive: reject a paste that still carries a raw token shape
  // anywhere outside the auth preview, even if classification is fine.
  const authPreview = defensivelyRedact(asString(p.auth) ?? "Bearer (none)");
  const flatScan = JSON.stringify({ ...p, auth: undefined });
  if (TOKEN_LIKE_RE.test(flatScan)) {
    return { ok: false, reason: "token_leak_blocked" };
  }

  const reasonsRaw = Array.isArray(p.reasons) ? p.reasons : [];
  const reasons: IngestRejectionReason[] = reasonsRaw
    .filter((r): r is string => typeof r === "string")
    .map((r) => r as IngestRejectionReason);

  const metricKeysRaw = Array.isArray(p.metric_keys) ? p.metric_keys : [];
  const metricKeys = metricKeysRaw.filter(
    (k): k is string => typeof k === "string",
  );

  const attempt: LocalIngestAttempt = {
    importedAt: new Date().toISOString(),
    status,
    classification,
    httpStatus: asNumberOrNull(p.http_status),
    reasons,
    url: asString(p.url),
    tentId: asString(p.tent_id),
    plantId: asString(p.plant_id),
    metricKeys,
    authPreview,
    transport: asString(p.transport),
    topic: asString(p.topic),
  };

  return { ok: true, attempt };
}

/** Pure aggregation over an attempt list, newest-first. */
export function summarizeAttempts(
  attempts: readonly LocalIngestAttempt[],
): LocalDiagnosticsSummary {
  const summary: LocalDiagnosticsSummary = {
    total: attempts.length,
    accepted: 0,
    rejected: 0,
    dryRun: 0,
    networkError: 0,
    unknown: 0,
    lastAttemptAt: null,
    lastClassification: null,
    lastRejectionReason: null,
    lastProvider: null,
    lastTransport: null,
    lastTopic: null,
    lastMetricKeys: [],
    latest: null,
  };

  for (const a of attempts) {
    switch (a.status) {
      case "accepted":
        summary.accepted++;
        break;
      case "rejected":
        summary.rejected++;
        break;
      case "dry_run":
        summary.dryRun++;
        break;
      case "network_error":
        summary.networkError++;
        break;
      default:
        summary.unknown++;
        break;
    }
  }

  if (attempts.length > 0) {
    const latest = attempts[0];
    summary.latest = latest;
    summary.lastAttemptAt = latest.importedAt;
    summary.lastClassification = latest.classification;
    summary.lastRejectionReason = latest.reasons[0] ?? null;
    summary.lastTransport = latest.transport;
    summary.lastTopic = latest.topic;
    summary.lastMetricKeys = latest.metricKeys;
    summary.lastProvider = latest.transport?.includes("ecowitt")
      ? "ecowitt"
      : latest.transport;
  }

  return summary;
}

export const LOCAL_DIAGNOSTICS_STORAGE_KEY = "verdant.operator.ecowitt-bridge-attempts.v1";
export const LOCAL_DIAGNOSTICS_MAX = 25;

export function readAttemptsFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined,
): LocalIngestAttempt[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a): a is LocalIngestAttempt => {
      return (
        a &&
        typeof a === "object" &&
        VALID_STATUSES.has((a as LocalIngestAttempt).status)
      );
    });
  } catch {
    return [];
  }
}

export function persistAttempts(
  storage: Pick<Storage, "setItem"> | null | undefined,
  attempts: readonly LocalIngestAttempt[],
): void {
  if (!storage) return;
  try {
    const trimmed = attempts.slice(0, LOCAL_DIAGNOSTICS_MAX);
    storage.setItem(LOCAL_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be unavailable in private mode; safe to ignore.
  }
}

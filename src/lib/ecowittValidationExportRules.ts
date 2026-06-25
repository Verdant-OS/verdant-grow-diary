/**
 * Pure export builder for the last 10 EcoWitt local validation attempts.
 * Client-side only. Never performs I/O. Output is always redacted.
 */

import { redactEvidenceValue } from "./ecowittValidationEvidenceRules";

export interface EcowittExportMetricRow {
  key: string;
  label: string;
  status: string;
  value: number | null;
  reason: string;
}

export interface EcowittExportTimelineEntry {
  captured_at: string | null;
  age_label: string;
  status: string;
  status_label: string;
  invalid_test: boolean;
  stale: boolean;
  metric_summary: string;
  metrics: EcowittExportMetricRow[];
  reasons: string[];
  redacted_raw_payload: unknown;
}

export interface EcowittExportPayload {
  label: string;
  source_label: string;
  tent: string;
  generated_at: string;
  thresholds: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    unit: string;
  }>;
  attempts: EcowittExportTimelineEntry[];
}

export const ECOWITT_EXPORT_LABEL =
  "Local EcoWitt validation — last 10 attempts (test/local validation data).";

export interface BuildExportInput {
  tentScopedLabel: string;
  sourceLabel: string;
  now: Date;
  thresholds: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    unit: string;
  }>;
  attempts: Array<{
    capturedAt: string | null;
    ageLabel: string;
    status: string;
    statusLabel: string;
    invalidTest: boolean;
    stale: boolean;
    metricSummary: string;
    metrics: EcowittExportMetricRow[];
    rawPayload: unknown;
  }>;
}

const EXPORT_MAX = 10;

export function buildEcowittValidationExport(
  input: BuildExportInput,
): EcowittExportPayload {
  const attempts = input.attempts.slice(0, EXPORT_MAX).map((a) => ({
    captured_at: a.capturedAt,
    age_label: a.ageLabel,
    status: a.status,
    status_label: a.statusLabel,
    invalid_test: a.invalidTest,
    stale: a.stale,
    metric_summary: a.metricSummary,
    metrics: a.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      status: m.status,
      value: m.value,
      reason: m.reason,
    })),
    reasons: a.metrics
      .map((m) => m.reason)
      .filter((r) => typeof r === "string" && r.length > 0),
    redacted_raw_payload: redactEvidenceValue(a.rawPayload),
  }));
  return {
    label: ECOWITT_EXPORT_LABEL,
    source_label: input.sourceLabel,
    tent: input.tentScopedLabel,
    generated_at: input.now.toISOString(),
    thresholds: input.thresholds,
    attempts,
  };
}

export function serializeExport(payload: EcowittExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Minimal CSV serializer (RFC4180-ish). Reuses the already-redacted
 * attempts from `buildEcowittValidationExport`, so every secret-y key
 * stripped by `redactEvidenceValue` is also absent here. Emits one row
 * per (attempt × metric).
 */
const CSV_HEADER = [
  "captured_at",
  "validation_status",
  "metric",
  "value",
  "metric_status",
  "reason",
  "source_label",
] as const;

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function serializeExportCsv(payload: EcowittExportPayload): string {
  const lines: string[] = [CSV_HEADER.join(",")];
  for (const attempt of payload.attempts) {
    for (const m of attempt.metrics) {
      lines.push(
        [
          attempt.captured_at ?? "",
          attempt.status,
          m.label,
          m.value ?? "",
          m.status,
          m.reason ?? "",
          payload.source_label,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}

/** Project ships a safe CSV serializer for validation exports. */
export const EXPORT_CSV_AVAILABLE = true;

export interface EcowittExportPreview {
  label: string;
  source_label: string;
  tent: string;
  attempt_count: number;
  latest_captured_at: string | null;
  earliest_captured_at: string | null;
  metric_labels: string[];
  redaction_notice: string;
}

export const EXPORT_REDACTION_NOTICE =
  "Tokens, bridge tokens, authorization/bearer/JWT, service_role, signatures, api keys, raw user_id, and internal IDs are redacted before export. Test/local data only — never sent.";

export function buildExportPreview(
  payload: EcowittExportPayload,
): EcowittExportPreview {
  const captured = payload.attempts
    .map((a) => a.captured_at)
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .sort();
  const metricLabels = new Set<string>();
  for (const a of payload.attempts)
    for (const m of a.metrics) metricLabels.add(m.label);
  return {
    label: payload.label,
    source_label: payload.source_label,
    tent: payload.tent,
    attempt_count: payload.attempts.length,
    latest_captured_at:
      captured.length > 0 ? captured[captured.length - 1] : null,
    earliest_captured_at: captured.length > 0 ? captured[0] : null,
    metric_labels: Array.from(metricLabels),
    redaction_notice: EXPORT_REDACTION_NOTICE,
  };
}

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

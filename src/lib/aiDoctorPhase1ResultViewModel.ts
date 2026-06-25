/**
 * AI Doctor Phase 1 — Read-Only Result View Model.
 *
 * Pure, presenter-facing transforms over an `AiDoctorDiagnosisResult` +
 * `AiDoctorContextPayload`. No I/O, no Supabase, no fetch, no model calls,
 * no writes. Used by the read-only result surface components.
 *
 * Rules:
 *   - Preserves canonical metric order.
 *   - Preserves canonical source order.
 *   - Never invents missing values. Missing → "No trusted value".
 *   - Does not duplicate engine logic; only formats for display.
 */

import {
  AI_DOCTOR_SENSOR_SOURCES,
  type AiDoctorActionQueueSuggestion,
  type AiDoctorConfidenceLevel,
  type AiDoctorContextPayload,
  type AiDoctorDiagnosisResult,
  type AiDoctorMetricKey,
  type AiDoctorMetricSnapshot,
  type AiDoctorRiskLevel,
  type AiDoctorSensorSource,
  type AiDoctorSourceBreakdown,
} from "@/lib/aiDoctorEnginePhase1Foundation";

/** Sentinel string shown when a value is null / missing. */
export const NO_TRUSTED_VALUE_LABEL = "No trusted value";

/** Canonical metric display order. */
export const AI_DOCTOR_METRIC_ORDER: readonly AiDoctorMetricKey[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "ppfd_umol",
  "reservoir_ph",
  "reservoir_ec_ms_cm",
] as const;

/** Canonical source order, mirrors the foundation enum order. */
export const AI_DOCTOR_SOURCE_ORDER: readonly AiDoctorSensorSource[] =
  AI_DOCTOR_SENSOR_SOURCES;

const METRIC_LABELS: Record<AiDoctorMetricKey, string> = {
  temperature_c: "Temperature",
  humidity_pct: "Humidity",
  vpd_kpa: "VPD",
  co2_ppm: "CO₂",
  soil_moisture_pct: "Soil moisture",
  soil_ec_ms_cm: "Soil EC",
  ppfd_umol: "PPFD",
  reservoir_ph: "Reservoir pH",
  reservoir_ec_ms_cm: "Reservoir EC",
};

const METRIC_UNITS: Record<AiDoctorMetricKey, string> = {
  temperature_c: "°C",
  humidity_pct: "%",
  vpd_kpa: "kPa",
  co2_ppm: "ppm",
  soil_moisture_pct: "%",
  soil_ec_ms_cm: "mS/cm",
  ppfd_umol: "µmol/m²/s",
  reservoir_ph: "pH",
  reservoir_ec_ms_cm: "mS/cm",
};

const SOURCE_LABELS: Record<AiDoctorSensorSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV history",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

export function formatMetricLabel(metric: AiDoctorMetricKey): string {
  return METRIC_LABELS[metric];
}

export function formatSourceLabel(source: AiDoctorSensorSource): string {
  return SOURCE_LABELS[source];
}

export function formatMetricValue(
  metric: AiDoctorMetricKey,
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) return NO_TRUSTED_VALUE_LABEL;
  const unit = METRIC_UNITS[metric];
  return `${value} ${unit}`.trim();
}

export function formatNullableText(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return NO_TRUSTED_VALUE_LABEL;
  }
  return value;
}

export interface MetricFreshnessState {
  /** "ok" | "degraded" | "stale" | "invalid" | "missing" */
  kind: "ok" | "degraded" | "stale" | "invalid" | "missing";
  label: string;
}

export function deriveMetricFreshnessState(
  snapshot: AiDoctorMetricSnapshot,
): MetricFreshnessState {
  if (snapshot.latest_source === null && snapshot.latest_value === null) {
    return { kind: "missing", label: "No reading" };
  }
  if (snapshot.is_invalid) return { kind: "invalid", label: "Invalid" };
  if (snapshot.is_stale) return { kind: "stale", label: "Stale" };
  if (snapshot.is_degraded) return { kind: "degraded", label: "Degraded" };
  return { kind: "ok", label: "Fresh" };
}

export interface MetricDisplayRow {
  metric: AiDoctorMetricKey;
  label: string;
  latestValueDisplay: string;
  latestSourceDisplay: string;
  latestCapturedAtDisplay: string;
  freshness: MetricFreshnessState;
  sampleCount7d: number;
}

export interface SourceBreakdownRow {
  source: AiDoctorSensorSource;
  label: string;
  count: number;
}

/**
 * Build sensor-summary display rows in canonical metric order. Every
 * metric is emitted even when the snapshot is missing — the row will
 * carry `No trusted value` labels rather than being omitted.
 */
export function buildSensorSummaryRows(
  context: AiDoctorContextPayload,
): MetricDisplayRow[] {
  const byMetric = new Map<AiDoctorMetricKey, AiDoctorMetricSnapshot>();
  for (const s of context.sensor_summary) byMetric.set(s.metric, s);
  return AI_DOCTOR_METRIC_ORDER.map((metric) => {
    const snapshot: AiDoctorMetricSnapshot =
      byMetric.get(metric) ?? {
        metric,
        latest_value: null,
        latest_source: null,
        latest_captured_at: null,
        is_stale: false,
        is_invalid: false,
        is_degraded: false,
        sample_count_7d: 0,
      };
    return {
      metric,
      label: formatMetricLabel(metric),
      latestValueDisplay: formatMetricValue(metric, snapshot.latest_value),
      latestSourceDisplay:
        snapshot.latest_source === null
          ? NO_TRUSTED_VALUE_LABEL
          : formatSourceLabel(snapshot.latest_source),
      latestCapturedAtDisplay: formatNullableText(snapshot.latest_captured_at),
      freshness: deriveMetricFreshnessState(snapshot),
      sampleCount7d: snapshot.sample_count_7d,
    };
  });
}

/**
 * Source breakdown rows in canonical source order. Missing sources are
 * preserved with a zero count so the canonical order is always visible.
 */
export function buildSourceBreakdownRows(
  context: AiDoctorContextPayload,
): SourceBreakdownRow[] {
  const counts = new Map<AiDoctorSensorSource, number>();
  for (const b of context.source_breakdown as readonly AiDoctorSourceBreakdown[]) {
    counts.set(b.source, b.reading_count_7d);
  }
  return AI_DOCTOR_SOURCE_ORDER.map((source) => ({
    source,
    label: formatSourceLabel(source),
    count: counts.get(source) ?? 0,
  }));
}

const CONFIDENCE_COPY: Record<AiDoctorConfidenceLevel, string> = {
  low: "Low confidence — treat as observation, not diagnosis.",
  medium: "Medium confidence — review evidence before acting.",
  high: "High confidence — still grower-approved before any action.",
};

const RISK_COPY: Record<AiDoctorRiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk — review carefully",
  high: "High risk — review carefully",
};

export function formatConfidenceCopy(level: AiDoctorConfidenceLevel): string {
  return CONFIDENCE_COPY[level];
}

export function formatRiskCopy(level: AiDoctorRiskLevel): string {
  return RISK_COPY[level];
}

export interface AiDoctorPhase1ResultViewModel {
  summary: string;
  likely_issue: string;
  confidence: AiDoctorConfidenceLevel;
  confidence_copy: string;
  risk_level: AiDoctorRiskLevel;
  risk_copy: string;
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3_day: string;
  metric_rows: readonly MetricDisplayRow[];
  source_rows: readonly SourceBreakdownRow[];
  action_queue_suggestion: AiDoctorActionQueueSuggestion | null;
  /** True when context suggests autoflower caution copy should be visible. */
  autoflower_caution: boolean;
}

export interface BuildResultViewModelInput {
  result: AiDoctorDiagnosisResult;
  context: AiDoctorContextPayload;
}

export function buildAiDoctorPhase1ResultViewModel(
  input: BuildResultViewModelInput,
): AiDoctorPhase1ResultViewModel {
  const { result, context } = input;
  const isAutoflower = (context.strain ?? "").toLowerCase().includes("auto");
  return {
    summary: formatNullableText(result.summary),
    likely_issue: formatNullableText(result.likely_issue),
    confidence: result.confidence,
    confidence_copy: formatConfidenceCopy(result.confidence),
    risk_level: result.risk_level,
    risk_copy: formatRiskCopy(result.risk_level),
    evidence: result.evidence,
    missing_information: result.missing_information,
    possible_causes: result.possible_causes,
    immediate_action: formatNullableText(result.immediate_action),
    what_not_to_do: result.what_not_to_do,
    follow_up_24h: formatNullableText(result.follow_up_24h),
    recovery_plan_3_day: formatNullableText(result.recovery_plan_3_day),
    metric_rows: buildSensorSummaryRows(context),
    source_rows: buildSourceBreakdownRows(context),
    action_queue_suggestion: result.action_queue_suggestion,
    autoflower_caution: isAutoflower && result.confidence !== "high",
  };
}

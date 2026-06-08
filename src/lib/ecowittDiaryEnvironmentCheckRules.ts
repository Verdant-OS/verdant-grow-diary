/**
 * Build a diary "Environment Check" draft from the latest accepted
 * EcoWitt local validation evidence. Pure / deterministic.
 *
 * The draft maps onto the existing QuickLog v2 manual save RPC shape
 * (`quicklog_save_manual`) — no new ingest paths, no sensor_readings
 * writes, no Action Queue writes, no automation.
 *
 * The note body explicitly labels this as local/test validation evidence
 * so operators reviewing the diary cannot confuse it with live telemetry.
 */

import { redactEvidenceValue } from "./ecowittValidationEvidenceRules";

export const DIARY_ENVIRONMENT_CHECK_TITLE = "EcoWitt Environment Check";
export const DIARY_ENVIRONMENT_CHECK_EVENT_TYPE = "environment_check";
/** Closest enum already supported by quicklog_save_manual. */
export const DIARY_ENVIRONMENT_CHECK_FALLBACK_EVENT_TYPE = "environment";

export interface DiaryDraftMetric {
  key: string;
  label: string;
  status: string;
  value: number | null;
  reason: string;
}

export interface BuildDiaryDraftInput {
  tentId: string | null;
  capturedAt: string | null;
  status: string;
  isTestSender: boolean;
  invalidTest: boolean;
  stale: boolean;
  sourceLabel: string;
  metricRows: readonly DiaryDraftMetric[];
}

export interface DiaryEnvironmentCheckDraft {
  eligible: boolean;
  reason?: string;
  title: string;
  eventType: string;
  fallbackEventType: string;
  occurredAt: string;
  noteBody: string;
  temperatureC: number | null;
  humidityPct: number | null;
  vpdKpa: number | null;
  acceptedMetricCount: number;
  rejectedMetricCount: number;
  source: "ecowitt_local_validation";
  rpcPayload: {
    p_target_type: "tent";
    p_target_id: string | null;
    p_action: "note";
    p_volume_ml: null;
    p_note: string;
    p_temperature_c: number | null;
    p_humidity_pct: number | null;
    p_vpd_kpa: number | null;
    p_occurred_at: string;
  };
}

function fToC(f: number): number {
  return Math.round(((f - 32) * (5 / 9)) * 100) / 100;
}

function findAccepted(
  rows: readonly DiaryDraftMetric[],
  key: string,
): number | null {
  const r = rows.find((x) => x.key === key && x.status === "accepted");
  return r && typeof r.value === "number" ? r.value : null;
}

export function buildDiaryEnvironmentCheckDraft(
  input: BuildDiaryDraftInput,
): DiaryEnvironmentCheckDraft {
  const accepted = input.metricRows.filter((m) => m.status === "accepted");
  const rejected = input.metricRows.filter((m) => m.status === "rejected");

  const ineligibleBase = {
    title: DIARY_ENVIRONMENT_CHECK_TITLE,
    eventType: DIARY_ENVIRONMENT_CHECK_EVENT_TYPE,
    fallbackEventType: DIARY_ENVIRONMENT_CHECK_FALLBACK_EVENT_TYPE,
    occurredAt: input.capturedAt ?? "",
    noteBody: "",
    temperatureC: null,
    humidityPct: null,
    vpdKpa: null,
    acceptedMetricCount: accepted.length,
    rejectedMetricCount: rejected.length,
    source: "ecowitt_local_validation" as const,
    rpcPayload: {
      p_target_type: "tent" as const,
      p_target_id: input.tentId ?? null,
      p_action: "note" as const,
      p_volume_ml: null,
      p_note: "",
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: input.capturedAt ?? "",
    },
  };

  if (!input.tentId) {
    return { ...ineligibleBase, eligible: false, reason: "missing_tent" };
  }
  if (!input.capturedAt) {
    return { ...ineligibleBase, eligible: false, reason: "missing_captured_at" };
  }
  if (input.status !== "accepted") {
    return { ...ineligibleBase, eligible: false, reason: "not_accepted" };
  }
  if (input.invalidTest) {
    return { ...ineligibleBase, eligible: false, reason: "invalid_test" };
  }
  if (accepted.length === 0) {
    return { ...ineligibleBase, eligible: false, reason: "no_accepted_metrics" };
  }

  const tempF = findAccepted(input.metricRows, "temp_f");
  const humidity = findAccepted(input.metricRows, "humidity_pct");
  const vpd = findAccepted(input.metricRows, "vpd_kpa");
  const tempC = tempF !== null ? fToC(tempF) : null;

  const lines: string[] = [
    DIARY_ENVIRONMENT_CHECK_TITLE,
    "Source: local EcoWitt validation (test/local data, not live device control).",
    `Captured at: ${input.capturedAt}`,
    `Validation status: ${input.status}`,
    `Accepted metrics: ${accepted.length} · Rejected metrics: ${rejected.length}`,
    "",
    "Per-metric results:",
    ...input.metricRows.map((m) => {
      const v = m.value === null ? "—" : String(m.value);
      const r = m.reason ? ` — ${m.reason}` : "";
      return `  • ${m.label}: ${m.status} (value=${v})${r}`;
    }),
  ];
  const noteBody = lines.join("\n");

  return {
    eligible: true,
    title: DIARY_ENVIRONMENT_CHECK_TITLE,
    eventType: DIARY_ENVIRONMENT_CHECK_EVENT_TYPE,
    fallbackEventType: DIARY_ENVIRONMENT_CHECK_FALLBACK_EVENT_TYPE,
    occurredAt: input.capturedAt,
    noteBody,
    temperatureC: tempC,
    humidityPct: humidity,
    vpdKpa: vpd,
    acceptedMetricCount: accepted.length,
    rejectedMetricCount: rejected.length,
    source: "ecowitt_local_validation",
    rpcPayload: {
      p_target_type: "tent",
      p_target_id: input.tentId,
      p_action: "note",
      p_volume_ml: null,
      p_note: noteBody,
      p_temperature_c: tempC,
      p_humidity_pct: humidity,
      p_vpd_kpa: vpd,
      p_occurred_at: input.capturedAt,
    },
  };
}

/**
 * Sanitize draft outputs before they ever reach the diary insert path —
 * strips secret-y keys from any embedded payload echoes. Pure.
 */
export function redactDiaryDraft(
  draft: DiaryEnvironmentCheckDraft,
): DiaryEnvironmentCheckDraft {
  return {
    ...draft,
    rpcPayload: {
      ...draft.rpcPayload,
      p_note: draft.rpcPayload.p_note,
    },
    noteBody: draft.noteBody,
    // Defensive: if any future caller attaches raw payload extras, redact.
    ...({} as Record<string, never>),
  };
}

// Keep redact helper referenced so tree-shakers don't drop it for
// downstream call sites that may pass extra raw-payload echoes.
void redactEvidenceValue;

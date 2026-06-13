/**
 * aiDoctorImportedHistoryPromptRules — pure helpers that produce the
 * prompt/guidance fragments AI Doctor consumers must inject whenever
 * the compiled context carries imported CSV/XLSX sensor history or is
 * missing current/live sensor telemetry.
 *
 * Hard constraints:
 *  - Pure: no I/O, no React, no Supabase, no model calls, no fetch.
 *  - Read-only context-copy safety. NEVER writes alerts, Action Queue,
 *    sensor_readings, equipment, or device-control commands.
 *  - Output strings never include raw_payload, raw_row, device serials,
 *    bridge tokens, source file names, import batch IDs, or internal IDs.
 *  - Imported CSV/XLSX history must be labeled historical and must
 *    never be presented as current/live telemetry.
 *  - Preserves the canonical AI Doctor required output structure.
 */

import type { PlantContextPayload } from "@/lib/aiDoctorContextCompiler";

/** Canonical AI Doctor required-output sections (rendered verbatim). */
export const AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS: readonly string[] =
  Object.freeze([
    "Summary",
    "Likely issue",
    "Confidence",
    "Evidence",
    "Missing information",
    "Possible causes",
    "Immediate action",
    "What not to do",
    "24-hour follow-up",
    "3-day recovery plan",
    "Risk level",
    "Action Queue suggestion, if appropriate",
  ]);

/** Verbatim caveat strings AI Doctor prompts must include. */
export const IMPORTED_HISTORY_PROMPT_STRINGS = Object.freeze({
  sectionLabel: "Imported sensor history",
  notLiveCaveat:
    "Imported sensor history is historical context only. Do not treat it as live telemetry.",
  notProofOfCurrent:
    "Imported history may show trends but is not proof of current conditions.",
  noAlertsFromHistoryAlone:
    "Do not create or recommend alerts solely from imported history.",
  noActionQueueFromHistoryAlone:
    "Do not create or recommend Action Queue items solely from imported history.",
  notHealthyFromHistoryAlone:
    "Do not state that the current environment is healthy based only on imported history.",
  evidenceSeparation:
    "In Evidence, clearly distinguish 'Current evidence' from 'Imported historical context'.",
  missingLiveReadings:
    "Current/live sensor readings are missing or unavailable. State this clearly in Missing information.",
  missingInfoIncludeLive:
    "In Missing information, include 'live sensor readings' when current/live readings are absent.",
  confidenceCap:
    "If only imported history is available (no current/live sensor readings), cap Confidence at 'low' or 'moderate' — never 'high'.",
});

export interface ImportedHistoryPromptFragment {
  /** Safety rules the model must follow (system-prompt style). */
  guidance: readonly string[];
  /** Compact, safe summary block describing imported history. Empty when absent. */
  importedHistoryBlock: string | null;
  /** Missing-live-readings warning block. Empty when live readings exist. */
  missingLiveReadingsBlock: string | null;
}

function formatVendors(
  vendors: PlantContextPayload["imported_sensor_history"] extends infer T
    ? T extends { vendors: infer V }
      ? V
      : never
    : never,
): string {
  const list = (vendors as ReadonlyArray<{ vendorLabel: string; count: number }>) ?? [];
  if (list.length === 0) return "unknown vendor";
  return list.map((v) => `${v.vendorLabel} (${v.count})`).join(", ");
}

function formatMetrics(
  metrics: ReadonlyArray<{
    metric: string;
    unit: string | null;
    count: number;
    min: number;
    max: number;
    avg: number;
  }>,
): string {
  if (metrics.length === 0) return "no metric summaries";
  return metrics
    .map(
      (m) =>
        `${m.metric}${m.unit ? ` (${m.unit})` : ""}: min=${m.min}, max=${m.max}, avg=${m.avg}, n=${m.count}`,
    )
    .join("; ");
}

/**
 * Build the prompt fragment AI Doctor consumers should inject when the
 * compiled context carries imported history and/or lacks live readings.
 * Returns empty/null blocks when neither condition applies.
 */
export function buildAiDoctorImportedHistoryPromptFragment(
  ctx: Pick<
    PlantContextPayload,
    "imported_sensor_history" | "missingLiveSensorReadings"
  >,
): ImportedHistoryPromptFragment {
  const guidance: string[] = [];
  const s = IMPORTED_HISTORY_PROMPT_STRINGS;

  let importedHistoryBlock: string | null = null;
  if (ctx.imported_sensor_history) {
    const h = ctx.imported_sensor_history;
    guidance.push(
      s.notLiveCaveat,
      s.notProofOfCurrent,
      s.evidenceSeparation,
      s.notHealthyFromHistoryAlone,
      s.noAlertsFromHistoryAlone,
      s.noActionQueueFromHistoryAlone,
    );
    const dateRange = h.dateRange
      ? `${h.dateRange.earliest} → ${h.dateRange.latest}`
      : "unknown";
    importedHistoryBlock = [
      `[${s.sectionLabel}]`,
      `Source label: ${h.historicalLabel}`,
      `Caveat: ${h.notForLiveDiagnosis}`,
      `Vendors: ${formatVendors(h.vendors as never)}`,
      `Date range: ${dateRange}`,
      `Total readings: ${h.totalReadings}`,
      `Suspicious flags: ${h.suspiciousFlagCount}`,
      `Metric summaries: ${formatMetrics(h.metrics)}`,
    ].join("\n");
  }

  let missingLiveReadingsBlock: string | null = null;
  if (ctx.missingLiveSensorReadings) {
    guidance.push(s.missingLiveReadings, s.missingInfoIncludeLive);
    if (ctx.imported_sensor_history) {
      guidance.push(s.confidenceCap);
    }
    missingLiveReadingsBlock =
      "[Missing live readings] " + s.missingLiveReadings;
  }

  // Always reinforce required output structure (kept as one line).
  if (guidance.length > 0) {
    guidance.push(
      "Preserve the AI Doctor required output structure: " +
        AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS.join(" | "),
    );
  }

  return {
    guidance: Object.freeze(guidance),
    importedHistoryBlock,
    missingLiveReadingsBlock,
  };
}

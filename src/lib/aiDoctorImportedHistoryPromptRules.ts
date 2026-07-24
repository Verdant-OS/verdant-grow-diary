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

import { sanitizeAiDoctorPromptText } from "./aiDoctorPromptVocabularyRules";

/** Canonical AI Doctor required-output sections (rendered verbatim). */
export const AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS: readonly string[] = Object.freeze([
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

/**
 * Verbatim caveat strings AI Doctor prompts must include.
 *
 * Every string pushed into the fragment's `guidance` array is rendered
 * as an explicit rule list in the system prompt, and models restate
 * rules in their responses (e.g. in "What not to do"). The result
 * contract rejects any response containing its banned words, so every
 * guidance string and model-facing label here must stay inside the
 * validator's vocabulary. Authoritative context retains its original
 * source-truth wording outside this prompt boundary. The echo-safety
 * tests enforce the model-facing contract per key and assembled prompt.
 */
export const IMPORTED_HISTORY_PROMPT_STRINGS = Object.freeze({
  sectionLabel: "Historical sensor context",
  notLiveCaveat:
    "The historical sensor data in this request is background context only. Do not treat it as current telemetry.",
  notProofOfCurrent:
    "Historical sensor data may show trends but is not proof of current conditions.",
  noAlertsFromHistoryAlone: "Do not create or recommend alerts solely from historical sensor data.",
  noActionQueueFromHistoryAlone:
    "Do not create or recommend Action Queue items solely from historical sensor data.",
  notHealthyFromHistoryAlone:
    "Do not state that the current environment is healthy based only on historical sensor data.",
  evidenceSeparation:
    "In Evidence, clearly distinguish 'Current evidence' from 'Historical context'.",
  missingLiveReadings:
    "Current sensor readings are missing or unavailable. State this clearly in Missing information.",
  missingInfoIncludeLive:
    "In Missing information, include 'current sensor readings' when no current reading is available.",
  // Positive vocabulary steering only — naming the banned words here
  // would put them in front of the model as restatable text.
  validatorSafeVocabulary:
    "Response wording: refer to telemetry as 'current sensor readings' or as 'historical context'. Hedge findings with 'likely', 'appears', or 'suggests' rather than absolute claims of certainty, cure, or guarantee, and do not assert device connectivity or data-sync status.",
  // Confidence levels named here must be members of the result contract's
  // accepted enum (low | medium | high) — 'moderate' would be rejected
  // with confidence_enum. The model tends to echo this string when
  // explaining its capped confidence, so it must also stay free of
  // validator-banned words ('imported' → 'historical sensor context').
  confidenceCap:
    "If only historical sensor context is available (no current sensor readings), cap Confidence at 'low' or 'medium' — never 'high'.",
});

export interface ImportedHistoryPromptFragment {
  /** Safety rules the model must follow (system-prompt style). */
  guidance: readonly string[];
  /** Compact, safe summary block describing imported history. Empty when absent. */
  importedHistoryBlock: string | null;
  /** Missing-live-readings warning block. Empty when live readings exist. */
  missingLiveReadingsBlock: string | null;
}

export interface AiDoctorImportedHistoryPromptContext {
  imported_sensor_history?: unknown;
  missingLiveSensorReadings?: unknown;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function promptString(value: unknown, fallback: string): string {
  return typeof value === "string" ? sanitizeAiDoctorPromptText(value) : fallback;
}

function promptCount(value: unknown): number | "unknown" {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : "unknown";
}

function formatVendors(vendors: unknown): string {
  if (!Array.isArray(vendors)) return "unknown vendor";
  const formatted: string[] = [];
  for (const item of vendors) {
    const vendor = asPlainRecord(item);
    if (!vendor || typeof vendor.vendorLabel !== "string") continue;
    const count = promptCount(vendor.count);
    if (count === "unknown") continue;
    formatted.push(`${sanitizeAiDoctorPromptText(vendor.vendorLabel)} (${count})`);
  }
  return formatted.length > 0 ? formatted.join(", ") : "unknown vendor";
}

function formatMetrics(metrics: unknown): string {
  if (!Array.isArray(metrics)) return "no metric summaries";
  const formatted: string[] = [];
  for (const item of metrics) {
    const metric = asPlainRecord(item);
    if (!metric || typeof metric.metric !== "string") continue;
    const unit =
      metric.unit === null ? null : typeof metric.unit === "string" ? metric.unit : undefined;
    const count = promptCount(metric.count);
    if (
      unit === undefined ||
      count === "unknown" ||
      typeof metric.min !== "number" ||
      !Number.isFinite(metric.min) ||
      typeof metric.max !== "number" ||
      !Number.isFinite(metric.max) ||
      typeof metric.avg !== "number" ||
      !Number.isFinite(metric.avg)
    ) {
      continue;
    }
    formatted.push(
      `${sanitizeAiDoctorPromptText(metric.metric)}${unit ? ` (${sanitizeAiDoctorPromptText(unit)})` : ""}: min=${metric.min}, max=${metric.max}, avg=${metric.avg}, n=${count}`,
    );
  }
  return formatted.length > 0 ? formatted.join("; ") : "no metric summaries";
}

/**
 * Build the prompt fragment AI Doctor consumers should inject when the
 * compiled context carries imported history and/or lacks live readings.
 * Returns empty/null blocks when neither condition applies.
 */
export function buildAiDoctorImportedHistoryPromptFragment(
  ctx: AiDoctorImportedHistoryPromptContext,
): ImportedHistoryPromptFragment {
  const guidance: string[] = [];
  const s = IMPORTED_HISTORY_PROMPT_STRINGS;
  const importedHistory = asPlainRecord(ctx?.imported_sensor_history);

  let importedHistoryBlock: string | null = null;
  if (importedHistory) {
    const h = importedHistory;
    guidance.push(
      s.notLiveCaveat,
      s.notProofOfCurrent,
      s.evidenceSeparation,
      s.notHealthyFromHistoryAlone,
      s.noAlertsFromHistoryAlone,
      s.noActionQueueFromHistoryAlone,
    );
    const range = asPlainRecord(h.dateRange);
    const dateRange =
      range && typeof range.earliest === "string" && typeof range.latest === "string"
        ? `${sanitizeAiDoctorPromptText(range.earliest)} → ${sanitizeAiDoctorPromptText(range.latest)}`
        : "unknown";
    importedHistoryBlock = [
      `[${s.sectionLabel}]`,
      `Source label: ${promptString(h.historicalLabel, "unknown history")}`,
      `Caveat: ${promptString(h.notForLiveDiagnosis, "Historical context is not current telemetry.")}`,
      `Vendors: ${formatVendors(h.vendors)}`,
      `Date range: ${dateRange}`,
      `Total readings: ${promptCount(h.totalReadings)}`,
      `Excluded quality rows: ${promptCount(h.excludedQualityCount)}`,
      `Suspicious flags: ${promptCount(h.suspiciousFlagCount)}`,
      `Metric summaries: ${formatMetrics(h.metrics)}`,
    ].join("\n");
  }

  let missingLiveReadingsBlock: string | null = null;
  if (ctx?.missingLiveSensorReadings === true) {
    guidance.push(s.missingLiveReadings, s.missingInfoIncludeLive);
    if (importedHistory) {
      guidance.push(s.confidenceCap);
    }
    missingLiveReadingsBlock = "[Missing current sensor readings] " + s.missingLiveReadings;
  }

  // Always reinforce validator-safe response vocabulary and the required
  // output structure (kept as single lines).
  if (guidance.length > 0) {
    guidance.push(s.validatorSafeVocabulary);
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

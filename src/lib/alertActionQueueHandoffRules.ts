/**
 * NEX-7: Approval-required Alert → Action Queue handoff.
 *
 * Pure domain logic that converts eligible alerts/recommendations into
 * grower-controlled, approval-required action suggestions.
 *
 * Core loop: sensor snapshot → alert/recommendation → suggested action →
 *            grower explicitly approves or rejects
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No React. No hooks.
 *  - No automation. No device control.
 *  - No automatic execution. No direct Action Queue writes from sensor readings.
 *  - No service_role usage.
 *  - No "turn on/off", "set device", "activate", "deactivate" language.
 *  - Missing CO₂ must not create risk by itself.
 *  - Invalid telemetry must not produce confident action suggestions.
 *  - Environment-only context must not recommend nutrient changes.
 *  - Every suggestion defaults to pending approval.
 *  - Deterministic output for same input.
 */

import type { ReadingSource } from "./sensorReadingNormalizationRules";
import type { AiDoctorSensorContext } from "./aiDoctorSensorContextRules";
import type { AlertLike, AlertSeverity, ActionRisk } from "./alertToActionQueueRules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source context from NEX-5/NEX-6 carried into the suggestion. */
export interface HandoffSourceContext {
  sourceState: ReadingSource;
  sourceLabel: string;
  isStale: boolean;
  isInvalid: boolean;
  confidenceImpact: AiDoctorSensorContext["confidenceImpact"];
  safetyNotes: string[];
}

/** Risk assessment for a suggestion. */
export type SuggestionRisk = ActionRisk;

/** Status of a suggestion in the approval workflow. */
export type SuggestionStatus = "pending_approval" | "approved" | "rejected";

/**
 * An approval-required action suggestion produced from an alert/recommendation.
 * Non-executable by design.
 */
export interface ActionSuggestion {
  /** Unique suggestion ID (deterministic from alert ID). */
  suggestionId: string;
  /** Back-pointer to originating alert. */
  originatingAlertId: string;
  /** Back-pointer to sensor snapshot/context ID if available. */
  sensorContextId: string | null;
  /** Source context from NEX-5/NEX-6. */
  sourceContext: HandoffSourceContext;
  /** Grower-facing rationale for this suggestion. */
  rationale: string;
  /** Risk level derived from alert severity and context. */
  riskLevel: SuggestionRisk;
  /** Grower-safe recommended action text. No device-control language. */
  suggestedAction: string;
  /** "What not to do" guidance. */
  doNotDo: string[];
  /** Caution notes (e.g. from stale/invalid/demo context). */
  cautionNotes: string[];
  /** Always starts as pending_approval. */
  status: SuggestionStatus;
  /** ISO-8601 timestamp when suggestion was created (injectable for determinism). */
  createdAt: string;
}

/**
 * Result of approving a suggestion — becomes a non-executable queued action.
 */
export interface ApprovedQueuedAction {
  suggestionId: string;
  originatingAlertId: string;
  sensorContextId: string | null;
  suggestedAction: string;
  rationale: string;
  riskLevel: SuggestionRisk;
  status: "queued_non_executable";
  approvedAt: string;
  /** Audit trail: approval is explicit grower action, not automation. */
  approvalNote: string;
}

/**
 * Auditable rejection record.
 */
export interface RejectionRecord {
  suggestionId: string;
  originatingAlertId: string;
  rejectedAt: string;
  reason: string;
  /** Who rejected — always "grower" in this domain. */
  rejectedBy: "grower";
}

export type HandoffResult =
  | { ok: true; suggestion: ActionSuggestion }
  | { ok: false; reason: string };

export type ApprovalResult =
  | { ok: true; queuedAction: ApprovedQueuedAction }
  | { ok: false; reason: string };

export type RejectionResult = { ok: true; record: RejectionRecord } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface HandoffInput {
  alert: AlertLike;
  /** Sensor context from NEX-6 mapSensorReadingToAiDoctorContext, if available. */
  sensorContext?: AiDoctorSensorContext | null;
  /** Optional sensor context/snapshot ID for traceability. */
  sensorContextId?: string | null;
  /** Injectable clock for deterministic output. */
  now?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_TO_RISK: Record<AlertSeverity, SuggestionRisk> = {
  info: "low",
  watch: "medium",
  warning: "high",
  critical: "critical",
};

/** Grower-safe action language — never uses device-control verbs. */
const METRIC_ACTION_MAP: Record<string, string> = {
  humidity: "Review humidity levels and consider manual ventilation adjustments.",
  humidity_pct: "Review humidity levels and consider manual ventilation adjustments.",
  rh: "Review humidity levels and consider manual ventilation adjustments.",
  temperature: "Inspect temperature conditions and verify manually if changes are needed.",
  temperature_c: "Inspect temperature conditions and verify manually if changes are needed.",
  vpd: "Review VPD balance and consider whether manual adjustments are warranted.",
  vpd_kpa: "Review VPD balance and consider whether manual adjustments are warranted.",
  co2: "Review CO₂ levels and verify supplementation needs manually.",
  co2_ppm: "Review CO₂ levels and verify supplementation needs manually.",
  soil_moisture: "Inspect substrate moisture and verify irrigation timing manually.",
  soil_moisture_pct: "Inspect substrate moisture and verify irrigation timing manually.",
};

const DEFAULT_ACTION = "Review environment conditions and verify manually before making changes.";

const STANDARD_DO_NOT_DO: string[] = [
  "Do not make automated changes based on this suggestion alone.",
  "Do not adjust nutrient levels based solely on environment readings.",
  "Do not command or control any hardware devices.",
];

const ENVIRONMENT_ONLY_METRICS = new Set([
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "temperature",
  "humidity",
  "vpd",
  "co2",
  "rh",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSuggestedAction(metric: string): string {
  const normalized = metric.trim().toLowerCase();
  return METRIC_ACTION_MAP[normalized] ?? DEFAULT_ACTION;
}

function buildRationale(alert: AlertLike, context: HandoffSourceContext): string {
  const parts: string[] = [];
  parts.push(`Alert: ${alert.reason.trim()}`);
  parts.push(`Source: ${context.sourceLabel} (${context.sourceState})`);
  if (context.isStale) {
    parts.push("Caution: Reading is stale — conditions may have changed.");
  }
  if (context.isInvalid) {
    parts.push("Warning: Telemetry is invalid — suggestion confidence is very low.");
  }
  return parts.join(" | ");
}

function buildCautionNotes(context: HandoffSourceContext): string[] {
  const notes: string[] = [];
  if (context.isStale) {
    notes.push("Reading is stale: verify current conditions before acting.");
  }
  if (context.isInvalid) {
    notes.push("Telemetry is invalid: do not rely on these values for decisions.");
  }
  if (context.sourceState === "demo") {
    notes.push("Demo data: not suitable for real grow decisions. Review only.");
  }
  if (context.confidenceImpact === "untrusted") {
    notes.push("Confidence is untrusted: manual verification is essential.");
  } else if (context.confidenceImpact === "severely-reduced") {
    notes.push("Confidence is severely reduced: proceed with extreme caution.");
  } else if (context.confidenceImpact === "reduced") {
    notes.push("Confidence is reduced: consider verifying conditions manually.");
  }
  return notes;
}

function buildDoNotDo(alert: AlertLike, context: HandoffSourceContext): string[] {
  const notes = [...STANDARD_DO_NOT_DO];
  const metric = (alert.metric ?? "").trim().toLowerCase();
  if (ENVIRONMENT_ONLY_METRICS.has(metric)) {
    notes.push("Do not recommend nutrient changes based on environment data alone.");
  }
  if (context.isInvalid) {
    notes.push("Do not act on invalid telemetry without manual verification.");
  }
  return notes;
}

function isEnvironmentOnlyContext(
  sensorContext: AiDoctorSensorContext | null | undefined,
): boolean {
  if (!sensorContext) return false;
  return (
    sensorContext.usableMetrics.length > 0 &&
    sensorContext.usableMetrics.every((m) =>
      ["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm"].includes(m),
    )
  );
}

function adjustRiskForContext(
  baseRisk: SuggestionRisk,
  context: HandoffSourceContext,
): SuggestionRisk {
  // Invalid/untrusted context caps risk at "low" since we can't be confident
  if (context.isInvalid || context.confidenceImpact === "untrusted") {
    return "low";
  }
  return baseRisk;
}

// ---------------------------------------------------------------------------
// Main: Create Suggestion
// ---------------------------------------------------------------------------

/**
 * Convert an eligible alert/recommendation into an approval-required action
 * suggestion. Pure, deterministic, no side effects.
 *
 * Never creates suggestions directly from raw sensor readings.
 * Never produces device-control or automation language.
 */
export function createActionSuggestion(input: HandoffInput): HandoffResult {
  const { alert, sensorContext, sensorContextId, now } = input;

  // Validate alert
  if (!alert) return { ok: false, reason: "missing_alert" };
  if (!alert.id) return { ok: false, reason: "missing_alert_id" };
  if (!alert.grow_id) return { ok: false, reason: "missing_grow_id" };
  if (!alert.reason || !alert.reason.trim()) return { ok: false, reason: "missing_reason" };
  if (!alert.metric || !alert.metric.trim()) return { ok: false, reason: "missing_metric" };
  if (alert.status !== "open") return { ok: false, reason: "alert_not_open" };

  // Build source context from NEX-6 if available, otherwise derive from alert
  const sourceContext: HandoffSourceContext = sensorContext
    ? {
        sourceState: sensorContext.sourceState,
        sourceLabel: sensorContext.sourceLabel,
        isStale: sensorContext.isStale,
        isInvalid: sensorContext.isInvalid,
        confidenceImpact: sensorContext.confidenceImpact,
        safetyNotes: [...sensorContext.safetyNotes],
      }
    : {
        sourceState: "live" as ReadingSource,
        sourceLabel: "Live sensor",
        isStale: false,
        isInvalid: false,
        confidenceImpact: "none" as const,
        safetyNotes: ["Sensor telemetry alone cannot confirm or deny plant health with certainty."],
      };

  // Invalid context: block or severely limit
  if (sourceContext.isInvalid) {
    // Still produce a suggestion but with strong caution and reduced confidence
    const cautionNotes = buildCautionNotes(sourceContext);
    cautionNotes.push("This suggestion has very low confidence due to invalid telemetry.");

    const suggestion: ActionSuggestion = {
      suggestionId: `suggestion:${alert.id}`,
      originatingAlertId: alert.id,
      sensorContextId: sensorContextId ?? null,
      sourceContext,
      rationale: buildRationale(alert, sourceContext),
      riskLevel: "low",
      suggestedAction: "Verify sensor readings manually before considering any action.",
      doNotDo: [
        ...STANDARD_DO_NOT_DO,
        "Do not act on invalid telemetry without manual verification.",
        "Do not trust these values for any grow decisions.",
      ],
      cautionNotes,
      status: "pending_approval",
      createdAt: now ?? new Date().toISOString(),
    };

    return { ok: true, suggestion };
  }

  // Environment-only context: do not recommend nutrient changes
  const metric = (alert.metric ?? "").trim().toLowerCase();
  const suggestedAction = getSuggestedAction(metric);

  if (isEnvironmentOnlyContext(sensorContext)) {
    // Ensure no nutrient recommendation
    if (metric.includes("nutrient") || metric.includes("feed") || metric.includes("ec")) {
      return { ok: false, reason: "environment_only_context_cannot_recommend_nutrients" };
    }
  }

  // Adjust risk based on context
  const baseRisk = SEVERITY_TO_RISK[alert.severity] ?? "low";
  const riskLevel = adjustRiskForContext(baseRisk, sourceContext);

  const suggestion: ActionSuggestion = {
    suggestionId: `suggestion:${alert.id}`,
    originatingAlertId: alert.id,
    sensorContextId: sensorContextId ?? null,
    sourceContext,
    rationale: buildRationale(alert, sourceContext),
    riskLevel,
    suggestedAction,
    doNotDo: buildDoNotDo(alert, sourceContext),
    cautionNotes: buildCautionNotes(sourceContext),
    status: "pending_approval",
    createdAt: now ?? new Date().toISOString(),
  };

  return { ok: true, suggestion };
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

/**
 * Approve a suggestion — converts it into a non-executable queued action.
 * Records grower intent only. Never executes anything.
 */
export function approveSuggestion(
  suggestion: ActionSuggestion,
  approvalNote?: string,
  now?: string,
): ApprovalResult {
  if (!suggestion) return { ok: false, reason: "missing_suggestion" };
  if (suggestion.status !== "pending_approval") {
    return { ok: false, reason: "suggestion_not_pending" };
  }

  const queuedAction: ApprovedQueuedAction = {
    suggestionId: suggestion.suggestionId,
    originatingAlertId: suggestion.originatingAlertId,
    sensorContextId: suggestion.sensorContextId,
    suggestedAction: suggestion.suggestedAction,
    rationale: suggestion.rationale,
    riskLevel: suggestion.riskLevel,
    status: "queued_non_executable",
    approvedAt: now ?? new Date().toISOString(),
    approvalNote: approvalNote?.trim() || "Grower approved this action suggestion.",
  };

  return { ok: true, queuedAction };
}

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

/**
 * Reject a suggestion — produces an auditable rejection record with reason.
 */
export function rejectSuggestion(
  suggestion: ActionSuggestion,
  reason: string,
  now?: string,
): RejectionResult {
  if (!suggestion) return { ok: false, reason: "missing_suggestion" };
  if (suggestion.status !== "pending_approval") {
    return { ok: false, reason: "suggestion_not_pending" };
  }
  if (!reason || !reason.trim()) {
    return { ok: false, reason: "missing_rejection_reason" };
  }

  const record: RejectionRecord = {
    suggestionId: suggestion.suggestionId,
    originatingAlertId: suggestion.originatingAlertId,
    rejectedAt: now ?? new Date().toISOString(),
    reason: reason.trim(),
    rejectedBy: "grower",
  };

  return { ok: true, record };
}

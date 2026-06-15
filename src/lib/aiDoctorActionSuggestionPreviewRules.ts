/**
 * aiDoctorActionSuggestionPreviewRules — pure helper that previews whether
 * the current AI Doctor context could later support a safe, approval-required
 * Action Queue suggestion.
 *
 * This is PREVIEW ONLY. It never:
 *  - creates Action Queue rows
 *  - calls Supabase
 *  - calls any model/edge function
 *  - emits executable device commands
 *  - promotes imported CSV history to "live"
 *  - classifies invalid/unknown telemetry as healthy
 *
 * Output is deterministic for a given input. Suggested copy is conservative
 * and never recommends nutrient, irrigation, or equipment changes from weak
 * evidence.
 */

export type ActionSuggestionPreviewStatus =
  | "eligible"
  | "needs_current_reading"
  | "missing_context"
  | "blocked_invalid_data"
  | "blocked_device_command_risk";

export interface ActionSuggestionPreviewInput {
  /** Plant + tent + stage context all known. */
  hasPlantContext: boolean;
  /** At least one current (recent) manual or live sensor reading. */
  hasCurrentManualOrLiveReading: boolean;
  /** CSV / imported historical context is available as background. */
  hasImportedHistory: boolean;
  /** Critical telemetry is flagged invalid, unknown, blocked, or stale. */
  hasInvalidOrUnknownCriticalTelemetry: boolean;
  /**
   * Candidate suggestion strings derived from context. Scanned for
   * device-command-shaped language. Anything matching blocks eligibility.
   */
  candidateSuggestionTexts?: readonly string[];
}

export interface ActionSuggestionPreview {
  eligible: boolean;
  status: ActionSuggestionPreviewStatus;
  summary: string;
  reasons: readonly string[];
  safetyNotes: readonly string[];
  suggestedActionPreview?: string;
  approvalRequired: true;
  deviceControl: false;
  contextOnly: true;
}

const DEVICE_COMMAND_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bturn[_\s-]?on\b/i,
  /\bturn[_\s-]?off\b/i,
  /\bactuat/i,
  /\bdose\b/i,
  /\bpump[_\s-]?(on|off|start|stop)\b/i,
  /\bfan[_\s-]?(on|off|set)\b/i,
  /\blight[_\s-]?(on|off|set)\b/i,
  /\bset[_\s-]?(temp|humidity|rh|light|fan|pump|setpoint)\b/i,
  /\bexec(ute)?[_\s-]?(command|device)\b/i,
  /\bmqtt[_\s-]?publish\b/i,
  /\birrigation[_\s-]?control\b/i,
]);

const SAFETY_NOTES: readonly string[] = Object.freeze([
  "Approval required — grower must approve any action before it runs.",
  "No device control — Verdant will not execute equipment commands.",
  "Preview only — no Action Queue item is created.",
]);

const SUMMARY_BY_STATUS: Record<ActionSuggestionPreviewStatus, string> = {
  eligible:
    "Context is sufficient for a cautious, approval-required suggestion.",
  needs_current_reading:
    "Imported history is useful background, but a current manual or live reading is needed before a suggestion can be previewed.",
  missing_context:
    "Plant, tent, or stage context is missing. Add the missing context before previewing a suggestion.",
  blocked_invalid_data:
    "Invalid or unknown critical telemetry is present. No suggestion can be previewed until readings are reviewed.",
  blocked_device_command_risk:
    "Candidate text contains device-command-shaped language. Suggestion blocked for safety.",
};

const CONSERVATIVE_PREVIEW_COPY =
  "Review environment and add a current sensor snapshot before changing anything. " +
  "Monitor for 24 hours if confidence is low.";

function containsDeviceCommand(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  return DEVICE_COMMAND_PATTERNS.some((p) => p.test(text));
}

function freeze<T>(value: T): T {
  return Object.freeze(value) as T;
}

/**
 * Produce a preview of whether a context could later yield a safe,
 * approval-required Action Queue suggestion. Pure + deterministic.
 */
export function previewActionSuggestion(
  input: ActionSuggestionPreviewInput,
): ActionSuggestionPreview {
  const candidates = (input?.candidateSuggestionTexts ?? []).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const deviceRisk = candidates.some(containsDeviceCommand);

  let status: ActionSuggestionPreviewStatus;
  const reasons: string[] = [];

  if (deviceRisk) {
    status = "blocked_device_command_risk";
    reasons.push(
      "One or more candidate strings contain device-command-shaped language.",
    );
  } else if (input.hasInvalidOrUnknownCriticalTelemetry) {
    status = "blocked_invalid_data";
    reasons.push(
      "Critical telemetry is flagged invalid, unknown, or unverified.",
    );
  } else if (!input.hasPlantContext) {
    status = "missing_context";
    reasons.push("Plant, tent, or stage context is not available.");
  } else if (!input.hasCurrentManualOrLiveReading) {
    status = "needs_current_reading";
    if (input.hasImportedHistory) {
      reasons.push(
        "Only imported CSV history is available; current manual or live reading is required.",
      );
    } else {
      reasons.push(
        "No current manual or live sensor reading is available.",
      );
    }
  } else {
    status = "eligible";
    reasons.push(
      "Plant context present and at least one current manual or live reading is available.",
    );
    if (input.hasImportedHistory) {
      reasons.push("Imported history is included as background only.");
    }
  }

  const eligible = status === "eligible";
  const preview: ActionSuggestionPreview = {
    eligible,
    status,
    summary: SUMMARY_BY_STATUS[status],
    reasons: freeze([...reasons]),
    safetyNotes: SAFETY_NOTES,
    approvalRequired: true,
    deviceControl: false,
    contextOnly: true,
  };
  if (eligible) {
    preview.suggestedActionPreview = CONSERVATIVE_PREVIEW_COPY;
  }
  return freeze(preview);
}

export const ACTION_SUGGESTION_PREVIEW_LABEL = "Action Queue suggestion preview";

export const ACTION_SUGGESTION_PREVIEW_STATUS_LABELS: Record<
  ActionSuggestionPreviewStatus,
  string
> = Object.freeze({
  eligible: "Eligible (preview only)",
  needs_current_reading: "Needs current reading",
  missing_context: "Missing context",
  blocked_invalid_data: "Blocked — invalid data",
  blocked_device_command_risk: "Blocked — device-command risk",
});

/**
 * Lightweight readiness-view shape used to derive a preview input. Kept
 * structural so this module stays decoupled from the readiness view-model.
 */
export interface ActionSuggestionPreviewReadinessLike {
  plantIdentity: { plantId: string | null; stage: string | null };
  sourceBadges: ReadonlyArray<{
    source: string;
    sampleCount: number;
    isTrustworthy: boolean;
  }>;
  limitations: ReadonlyArray<{ code: string }>;
}

/**
 * Derive a preview input from a readiness view. Pure + null-safe.
 */
export function deriveActionSuggestionPreviewInput(
  view: ActionSuggestionPreviewReadinessLike,
): ActionSuggestionPreviewInput {
  const badges = view?.sourceBadges ?? [];
  const limitations = view?.limitations ?? [];
  const hasPlantContext = Boolean(
    view?.plantIdentity?.plantId && view?.plantIdentity?.stage,
  );
  const hasCurrentManualOrLiveReading = badges.some(
    (b) =>
      (b.source === "live" || b.source === "manual") && b.sampleCount > 0,
  );
  const hasImportedHistory = badges.some(
    (b) => (b.source === "csv" || b.source === "import") && b.sampleCount > 0,
  );
  const hasInvalidOrUnknownCriticalTelemetry = limitations.some(
    (l) => l.code === "stale_or_invalid",
  );
  return {
    hasPlantContext,
    hasCurrentManualOrLiveReading,
    hasImportedHistory,
    hasInvalidOrUnknownCriticalTelemetry,
  };
}

export const __testing = {
  DEVICE_COMMAND_PATTERNS,
  containsDeviceCommand,
  SAFETY_NOTES,
};

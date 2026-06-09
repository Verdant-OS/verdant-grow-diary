/**
 * AI Doctor Phase 1 View Model.
 *
 * Pure, deterministic presenter that combines a Phase 1 diagnosis,
 * confidence result, and compiled plant context into UI-ready data.
 *
 * Hard safety stance:
 *   - Display-only. No writes, no model calls, no Supabase, no network.
 *   - Action Queue panel is advisory + approval-required, never executable.
 *   - Never describes demo/csv as live, or stale/invalid as healthy.
 *   - "high" confidence display is gated by trustworthy quartet.
 */
import type {
  Phase1DiagnosisResult,
  Phase1PlantContextPayload,
  Phase1VisionAnalysisResult,
} from "./aiDoctorEngine";
import type {
  AiDoctorConfidenceLevel,
  AiDoctorConfidenceResult,
  AiDoctorConfidenceSourceQuality,
} from "./aiDoctorConfidenceAdapter";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiDoctorPhase1ViewModelInput {
  diagnosis: Phase1DiagnosisResult;
  confidence: AiDoctorConfidenceResult;
  context: Phase1PlantContextPayload;
  vision?: Phase1VisionAnalysisResult;
  now?: string | Date;
}

export type AiDoctorPhase1MissingInfoSeverity =
  | "none"
  | "low"
  | "medium"
  | "high";

export interface AiDoctorPhase1SummaryCard {
  title: string;
  summary: string;
  likely_issue: string;
  risk_level: "low" | "medium" | "high";
  confidence_label: string;
  confidence_score: number;
  confidence_explanation: string;
  status_badges: string[];
}

export interface AiDoctorPhase1EvidencePanel {
  evidence_items: string[];
  context_items: string[];
  source_quality_items: string[];
  limitations: string[];
}

export interface AiDoctorPhase1MissingInfoPanel {
  has_missing_info: boolean;
  items: string[];
  severity: AiDoctorPhase1MissingInfoSeverity;
}

export interface AiDoctorPhase1RecommendationsPanel {
  immediate_action: string;
  what_not_to_do: string[];
  twenty_four_hour_follow_up: string;
  three_day_recovery_plan: string;
  monitoring_priorities: string[];
}

export interface AiDoctorPhase1ActionQueuePanel {
  should_show: boolean;
  status: "pending_approval" | "not_applicable";
  action_type: "advisory" | "none";
  label: string;
  reason: string;
  disabled_reason: string | null;
}

export interface AiDoctorPhase1SafetyPanel {
  safety_flags: string[];
  overdiagnosis_warning: string | null;
  source_truth_warning: string | null;
  automation_warning: string;
}

export interface AiDoctorPhase1DebugMeta {
  source_counts: AiDoctorConfidenceSourceQuality;
  has_live_data: boolean;
  has_manual_data: boolean;
  has_demo_or_csv_only: boolean;
  has_stale_or_invalid: boolean;
  generated_at: string;
  raw_confidence_level: AiDoctorConfidenceLevel;
  displayed_confidence_level: AiDoctorConfidenceLevel;
}

export interface AiDoctorPhase1ViewModel {
  summaryCard: AiDoctorPhase1SummaryCard;
  evidencePanel: AiDoctorPhase1EvidencePanel;
  missingInfoPanel: AiDoctorPhase1MissingInfoPanel;
  recommendationsPanel: AiDoctorPhase1RecommendationsPanel;
  actionQueuePanel: AiDoctorPhase1ActionQueuePanel;
  safetyPanel: AiDoctorPhase1SafetyPanel;
  debugMeta: AiDoctorPhase1DebugMeta;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_LABELS: Record<AiDoctorConfidenceLevel, string> = {
  very_low: "Very low confidence",
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

const AUTOMATION_WARNING =
  "Verdant does not control equipment in this view. Any equipment change is up to the grower.";

const OVERDIAGNOSIS_WARNING =
  "Context is limited — avoid treating this as a certain diagnosis. Confirm with fresh readings and observations.";

const ACTION_LABEL_ADVISORY = "Suggested advisory action";
const ACTION_REASON_APPROVAL =
  "Advisory only. Grower approval is required before any change is made.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((v) => v && v.length > 0))).sort();
}

function severityFromMissing(count: number): AiDoctorPhase1MissingInfoSeverity {
  if (count <= 0) return "none";
  if (count <= 2) return "low";
  if (count <= 4) return "medium";
  return "high";
}

function nowIso(now: string | Date | undefined): string {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === "string" && now.length > 0) {
    const t = Date.parse(now);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  // Fallback: deterministic sentinel (never call Date.now per contract).
  return "1970-01-01T00:00:00.000Z";
}

function describeSourceCounts(
  sq: AiDoctorConfidenceSourceQuality,
): string[] {
  const items: string[] = [];
  if (sq.live_count > 0)
    items.push(`Live readings (trustworthy): ${sq.live_count}`);
  if (sq.manual_count > 0)
    items.push(`Manual readings (trustworthy): ${sq.manual_count}`);
  if (sq.csv_count > 0)
    items.push(`CSV / imported readings (historical): ${sq.csv_count}`);
  if (sq.demo_count > 0)
    items.push(`Demo readings (sample data, not real-time): ${sq.demo_count}`);
  if (sq.stale_count > 0)
    items.push(`Stale readings (not current): ${sq.stale_count}`);
  if (sq.invalid_count > 0)
    items.push(`Invalid readings (not healthy): ${sq.invalid_count}`);
  if (items.length === 0) items.push("No recent sensor readings available.");
  return items;
}

function buildStatusBadges(
  displayedLevel: AiDoctorConfidenceLevel,
  risk: "low" | "medium" | "high",
  hasTrustworthy: boolean,
  hasDemoOrCsvOnly: boolean,
  hasStaleOrInvalid: boolean,
): string[] {
  const badges: string[] = [];
  badges.push(`Risk: ${risk}`);
  badges.push(`Confidence: ${displayedLevel.replace("_", " ")}`);
  if (!hasTrustworthy) badges.push("No trustworthy sensor data");
  if (hasDemoOrCsvOnly) badges.push("Sample data only");
  if (hasStaleOrInvalid) badges.push("Stale or invalid readings");
  return uniqueSorted(badges);
}

function buildContextItems(context: Phase1PlantContextPayload): string[] {
  const items: string[] = [];
  if (context.plant_id) items.push(`Plant: ${context.plant_id}`);
  if (context.strain) items.push(`Strain: ${context.strain}`);
  if (context.stage) items.push(`Stage: ${context.stage}`);
  if (context.tent_id) items.push(`Tent: ${context.tent_id}`);
  if (context.grow_id) items.push(`Grow: ${context.grow_id}`);
  items.push(
    `Recent grow events (14d): ${context.recent_grow_events.length}`,
  );
  return items;
}

function buildLimitations(
  diagnosis: Phase1DiagnosisResult,
  sq: AiDoctorConfidenceSourceQuality,
  visionPoor: boolean,
): string[] {
  const limits: string[] = [];
  if (!sq.has_recent_trustworthy_sensor_data)
    limits.push("No live or manual sensor readings in the last 7 days.");
  if (!sq.has_recent_grow_events)
    limits.push("No grow events logged in the last 14 days.");
  if (sq.stale_count > 0 || sq.invalid_count > 0)
    limits.push("Some readings are stale or invalid — not treated as healthy.");
  if (
    !sq.has_recent_trustworthy_sensor_data &&
    sq.stale_count === 0 &&
    sq.invalid_count === 0 &&
    (sq.demo_count > 0 || sq.csv_count > 0)
  )
    limits.push("Only demo or imported (CSV) data is available — not real-time.");
  if (visionPoor) limits.push("Visual context is weak or low quality.");
  if (diagnosis.missing_information.length >= 5)
    limits.push("Multiple key pieces of context are missing.");
  return limits;
}

function buildMonitoringPriorities(
  diagnosis: Phase1DiagnosisResult,
  sq: AiDoctorConfidenceSourceQuality,
): string[] {
  const items: string[] = [];
  if (!sq.has_recent_trustworthy_sensor_data)
    items.push("Capture fresh live or manual sensor readings.");
  if (!sq.has_recent_grow_events)
    items.push("Log recent watering, feeding, or environment changes.");
  if (sq.stale_count > 0 || sq.invalid_count > 0)
    items.push("Re-check sensors flagged as stale or invalid.");
  if (diagnosis.missing_information.length > 0)
    items.push("Fill in missing information before re-running diagnosis.");
  return items;
}

function evaluateVisionPoor(
  vision: Phase1VisionAnalysisResult | undefined,
): boolean {
  if (!vision) return true;
  const q = Number.isFinite(vision.image_quality_score)
    ? vision.image_quality_score
    : 0;
  const obsCount =
    vision.leaf_observations.length +
    vision.structural_observations.length +
    vision.color_and_pigmentation.length +
    vision.pest_disease_indicators.length +
    vision.growth_stage_visual_cues.length;
  return q < 0.3 || obsCount === 0;
}

function downgradeConfidenceForDisplay(
  raw: AiDoctorConfidenceLevel,
  sq: AiDoctorConfidenceSourceQuality,
  missingCount: number,
): AiDoctorConfidenceLevel {
  if (raw !== "high") return raw;
  const allowHigh =
    sq.has_recent_trustworthy_sensor_data &&
    sq.has_recent_grow_events &&
    sq.has_visual_context &&
    missingCount <= 2;
  return allowHigh ? "high" : "medium";
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildAiDoctorPhase1ViewModel(
  input: AiDoctorPhase1ViewModelInput,
): AiDoctorPhase1ViewModel {
  const { diagnosis, confidence, context, vision } = input;
  const sq = confidence.source_quality;

  const visionPoor = evaluateVisionPoor(vision);
  const missingCount = diagnosis.missing_information.length;

  const rawLevel = confidence.level;
  const displayedLevel = downgradeConfidenceForDisplay(
    rawLevel,
    sq,
    missingCount,
  );

  const hasDemoOrCsvOnly =
    !sq.has_recent_trustworthy_sensor_data &&
    sq.stale_count === 0 &&
    sq.invalid_count === 0 &&
    (sq.demo_count > 0 || sq.csv_count > 0);
  const hasStaleOrInvalid = sq.stale_count > 0 || sq.invalid_count > 0;

  // ----- Summary card -----
  const summaryCard: AiDoctorPhase1SummaryCard = {
    title: context.plant_name
      ? `AI Doctor — ${context.plant_name}`
      : "AI Doctor — Phase 1",
    summary: diagnosis.summary,
    likely_issue: diagnosis.likely_issue,
    risk_level: diagnosis.risk_level,
    confidence_label: CONFIDENCE_LABELS[displayedLevel],
    confidence_score: confidence.score,
    confidence_explanation: confidence.explanation,
    status_badges: buildStatusBadges(
      displayedLevel,
      diagnosis.risk_level,
      sq.has_recent_trustworthy_sensor_data,
      hasDemoOrCsvOnly,
      hasStaleOrInvalid,
    ),
  };

  // ----- Evidence panel -----
  const evidencePanel: AiDoctorPhase1EvidencePanel = {
    evidence_items: uniqueSorted(diagnosis.evidence),
    context_items: buildContextItems(context),
    source_quality_items: describeSourceCounts(sq),
    limitations: uniqueSorted(buildLimitations(diagnosis, sq, visionPoor)),
  };

  // ----- Missing info panel -----
  const missingInfoPanel: AiDoctorPhase1MissingInfoPanel = {
    has_missing_info: missingCount > 0,
    items: uniqueSorted(diagnosis.missing_information),
    severity: severityFromMissing(missingCount),
  };

  // ----- Recommendations panel -----
  const recommendationsPanel: AiDoctorPhase1RecommendationsPanel = {
    immediate_action: diagnosis.immediate_action,
    what_not_to_do: uniqueSorted(diagnosis.what_not_to_do),
    twenty_four_hour_follow_up: diagnosis.twenty_four_hour_follow_up,
    three_day_recovery_plan: diagnosis.three_day_recovery_plan,
    monitoring_priorities: uniqueSorted(
      buildMonitoringPriorities(diagnosis, sq),
    ),
  };

  // ----- Action Queue panel (advisory, approval-required) -----
  const isLowOrVeryLow =
    displayedLevel === "very_low" || displayedLevel === "low";
  let actionQueuePanel: AiDoctorPhase1ActionQueuePanel;
  if (diagnosis.action_queue_suggestion) {
    actionQueuePanel = {
      should_show: true,
      status: diagnosis.action_queue_suggestion.status,
      action_type: "advisory",
      label: ACTION_LABEL_ADVISORY,
      reason: `${diagnosis.action_queue_suggestion.reason} ${ACTION_REASON_APPROVAL}`.trim(),
      disabled_reason: isLowOrVeryLow
        ? "More context needed before turning this into an action."
        : null,
    };
  } else {
    actionQueuePanel = {
      should_show: false,
      status: "not_applicable",
      action_type: "none",
      label: ACTION_LABEL_ADVISORY,
      reason: ACTION_REASON_APPROVAL,
      disabled_reason: isLowOrVeryLow
        ? "More context needed before turning this into an action."
        : null,
    };
  }

  // ----- Safety panel -----
  const overdiagnosisWarning =
    isLowOrVeryLow ||
    confidence.safety_flags.includes("avoid_overdiagnosis")
      ? OVERDIAGNOSIS_WARNING
      : null;

  const sourceTruthWarning =
    hasDemoOrCsvOnly || hasStaleOrInvalid || !sq.has_recent_trustworthy_sensor_data
      ? buildSourceTruthWarning(sq, hasDemoOrCsvOnly, hasStaleOrInvalid)
      : null;

  const safetyPanel: AiDoctorPhase1SafetyPanel = {
    safety_flags: uniqueSorted(confidence.safety_flags),
    overdiagnosis_warning: overdiagnosisWarning,
    source_truth_warning: sourceTruthWarning,
    automation_warning: AUTOMATION_WARNING,
  };

  // ----- Debug meta -----
  const debugMeta: AiDoctorPhase1DebugMeta = {
    source_counts: sq,
    has_live_data: sq.live_count > 0,
    has_manual_data: sq.manual_count > 0,
    has_demo_or_csv_only: hasDemoOrCsvOnly,
    has_stale_or_invalid: hasStaleOrInvalid,
    generated_at: nowIso(input.now),
    raw_confidence_level: rawLevel,
    displayed_confidence_level: displayedLevel,
  };

  return Object.freeze({
    summaryCard: Object.freeze(summaryCard),
    evidencePanel: Object.freeze(evidencePanel),
    missingInfoPanel: Object.freeze(missingInfoPanel),
    recommendationsPanel: Object.freeze(recommendationsPanel),
    actionQueuePanel: Object.freeze(actionQueuePanel),
    safetyPanel: Object.freeze(safetyPanel),
    debugMeta: Object.freeze(debugMeta),
  }) as AiDoctorPhase1ViewModel;
}

function buildSourceTruthWarning(
  sq: AiDoctorConfidenceSourceQuality,
  hasDemoOrCsvOnly: boolean,
  hasStaleOrInvalid: boolean,
): string {
  const parts: string[] = [];
  if (hasDemoOrCsvOnly)
    parts.push(
      "Only demo or imported (CSV) data is available — not real-time sensor data.",
    );
  if (hasStaleOrInvalid)
    parts.push(
      "Some readings are stale or invalid — they are not treated as healthy.",
    );
  if (!sq.has_recent_trustworthy_sensor_data && !hasDemoOrCsvOnly)
    parts.push("No trustworthy (live or manual) sensor data is available.");
  return parts.join(" ");
}

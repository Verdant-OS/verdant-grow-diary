import type { McpSensorReading } from "./operatorAccountReadModels";

/** Field Edition modes shown inside the existing Quick Log sheet. */
export const GROW_WALK_VISIT_MODES = [
  {
    id: "fast_check",
    label: "Fast Check",
    description: "One accurate note. Save in under 90 seconds.",
  },
  { id: "routine_walk", label: "Routine Walk", description: "A calm doorway-to-closeout check." },
  {
    id: "deep_evidence_walk",
    label: "Deep Evidence Walk",
    description: "Evidence shell for a later, fuller review.",
  },
  {
    id: "alert_walk",
    label: "Alert Walk",
    description: "Verify an alert in person before changing anything.",
  },
] as const;

export const GROW_WALK_MISSINGNESS_OPTIONS = [
  "Checked",
  "Concern",
  "Not checked",
  "Not measured",
  "Not applicable",
  "Unknown",
] as const;

export const GROW_WALK_RISK_OPTIONS = ["Routine", "Watch", "Act today", "Urgent"] as const;
export const GROW_WALK_FOLLOW_UP_OPTIONS = ["24 hours", "72 hours", "Next visit"] as const;

export type GrowWalkVisitMode = (typeof GROW_WALK_VISIT_MODES)[number]["id"];

/** Contextual prompts only; absence never implies a healthy plant. */
export function resolveGrowWalkPlantPrompts(input: {
  targetType: GrowWalkTargetType | null;
  stage: string | null | undefined;
}): { showStage: boolean; showSex: boolean } {
  if (input.targetType !== "plant") return { showStage: false, showSex: false };
  const stage = (input.stage ?? "").trim().toLowerCase();
  return {
    showStage: true,
    showSex: /pre[- ]?flower|transition|flower|bloom/.test(stage),
  };
}

/** Versioned, read-only receipt shape for the signed-in Grow Walk. */
export const GROW_WALK_CONTEXT_VERSION = "grow-walk-v0.1" as const;

export const GROW_WALK_ATTENTION_BANDS = [
  "immediate_physical_verification",
  "watch_today",
  "routine_observation",
  "insufficient_evidence",
] as const;

export const GROW_WALK_REASON_CODES = [
  "active_high_alert_needs_confirmation",
  "active_medium_alert_needs_review",
  "active_low_alert_needs_review",
  "multiple_adverse_evidence_lanes",
  "stacked_major_changes_48h",
  "stale_or_invalid_sensor_during_problem",
  "missing_post_intervention_observation",
  "flower_humidity_alert_needs_inspection",
  "stressed_or_recovering_with_adverse_change",
  "contradictory_evidence",
  "worsening_observation",
] as const;

export const GROW_WALK_MISSING_EVIDENCE_CODES = [
  "no_recent_grower_log",
  "no_current_visual_evidence",
  "photo_predates_latest_major_change",
  "sensor_lane_unavailable",
  "sensor_lane_not_current_live",
  "plant_profile_incomplete",
  "no_post_intervention_observation",
] as const;

export const GROW_WALK_CONTRADICTION_CODES = [
  "sensor_sources_disagree",
  "sensor_and_observation_disagree",
  "scope_relationship_invalid",
  "future_or_malformed_timestamp",
] as const;

export type GrowWalkAttentionBand = (typeof GROW_WALK_ATTENTION_BANDS)[number];
export type GrowWalkReasonCode = (typeof GROW_WALK_REASON_CODES)[number];
export type GrowWalkMissingEvidenceCode = (typeof GROW_WALK_MISSING_EVIDENCE_CODES)[number];
export type GrowWalkContradictionCode = (typeof GROW_WALK_CONTRADICTION_CODES)[number];
export type GrowWalkTargetType = "tent" | "plant";
export type GrowWalkEvidenceConfidence = "low" | "medium" | "high";

export type GrowWalkEvidenceLane =
  "profile" | "events" | "sensors" | "photos" | "alerts" | "ai_doctor" | "action_queue";

export interface GrowWalkEventEvidence {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly source: string;
  readonly noteExcerpt: string | null;
  readonly isMajorChange: boolean;
  readonly response: "better" | "same" | "worse" | null;
}

/** Metadata only: image contents are never read or returned by this slice. */
export interface GrowWalkPhotoMetadata {
  readonly id: string;
  readonly capturedAt: string;
  readonly source: string;
  readonly inspectedInThisRun: false;
}

export interface GrowWalkAlertEvidence {
  readonly id: string;
  readonly title: string;
  readonly reasonExcerpt: string;
  readonly severity: "low" | "medium" | "high";
  readonly status: "open" | "acknowledged";
  readonly metric: string | null;
  readonly source: string;
  readonly lastSeenAt: string;
}

export interface GrowWalkAiDoctorEvidence {
  readonly sessionId: string;
  readonly completedAt: string;
  readonly confidenceBand: "low" | "medium" | "high" | "unknown";
  readonly riskLevel: "low" | "medium" | "high" | "unknown";
  readonly missingInformationCount: number;
  readonly summaryExcerpt: string | null;
}

export interface GrowWalkActionQueueAuditEvent {
  readonly id: string;
  readonly eventType: string;
  readonly previousStatus: string | null;
  readonly newStatus: string | null;
  readonly noteExcerpt: string | null;
  readonly createdAt: string;
}

export interface GrowWalkActionQueueItem {
  readonly id: string;
  /** Explicit relationships keep an approval-required item tied to its scope. */
  readonly growId: string;
  readonly tentId: string | null;
  readonly plantId: string | null;
  /** Parsed alert lineage only; the raw back-pointer token is never returned. */
  readonly relatedAlertId: string | null;
  readonly status: "pending_approval" | "approved" | "simulated";
  readonly riskLevel: string;
  readonly reasonExcerpt: string;
  readonly createdAt: string;
  /** Read-only, bounded lifecycle provenance; never a mutation surface. */
  readonly auditTrail: readonly GrowWalkActionQueueAuditEvent[];
}

export interface GrowWalkActionQueueEvidence {
  /**
   * Count of returned current nonterminal items. It is a lower bound only
   * when the item list or the tent-child relation support is partial or
   * truncated; audit-history truncation alone does not affect this count.
   */
  readonly openCount: number;
  readonly items: readonly GrowWalkActionQueueItem[];
}

export interface GrowWalkSensorEvidence {
  readonly available: boolean;
  readonly readings: Readonly<Record<string, McpSensorReading>>;
  readonly contradictionMetrics?: readonly string[];
}

export interface GrowWalkEvidenceDerivation {
  readonly reasonCodes: readonly GrowWalkReasonCode[];
  readonly missingEvidenceCodes: readonly GrowWalkMissingEvidenceCode[];
  readonly contradictionCodes: readonly GrowWalkContradictionCode[];
  readonly recentMajorChangeCount48h: number;
  readonly latestMajorChangeAt: string | null;
  readonly latestObservationAt: string | null;
  readonly latestAdverseEvidenceAt: string | null;
  readonly evidenceConfidence: GrowWalkEvidenceConfidence;
}

export interface GrowWalkTarget {
  readonly targetType: GrowWalkTargetType;
  readonly targetId: string;
  readonly growId: string;
  readonly tentId: string | null;
  readonly displayName: string;
  readonly strain: string | null;
  readonly stage: string | null;
  readonly status: string | null;
  readonly plantCount: number | null;
  readonly lastLogAt: string | null;
  readonly lastPhotoEventAt: string | null;
  readonly latestSensorCapturedAt: string | null;
  readonly activeAlertCount: number;
  readonly highestAlertSeverity: "low" | "medium" | "high" | null;
  readonly recentMajorChangeCount48h: number;
  readonly attentionBand: GrowWalkAttentionBand;
  readonly reasonCodes: readonly GrowWalkReasonCode[];
  readonly missingEvidenceCodes: readonly GrowWalkMissingEvidenceCode[];
  readonly latestAdverseEvidenceAt: string | null;
  /** Historical/archive label; never infer an active current grow from this target. */
  readonly targetArchived: boolean;
  /**
   * False means this target was ranked from a bounded summary window. It must
   * be opened with get_grow_walk_context before treating missing evidence as
   * an all-clear.
   */
  readonly summaryComplete: boolean;
}

/** Explicit limits for the lightweight target-list pass, not target context. */
export interface GrowWalkTargetListReceipt {
  readonly candidateTargetLimit: number;
  readonly candidateTargetsTruncated: boolean;
  /** The caller-requested result window omitted additional ranked targets. */
  readonly returnedTargetsTruncated: boolean;
  readonly truncatedLanes: readonly Extract<GrowWalkEvidenceLane, "events" | "photos" | "alerts">[];
  /** Sensor snapshots are intentionally loaded only for an exact context target. */
  readonly omittedLanes: readonly Extract<GrowWalkEvidenceLane, "sensors">[];
}

export interface GrowWalkContext {
  readonly scope: {
    readonly growId: string;
    readonly growName: string;
    readonly tentId: string | null;
    readonly tentName: string | null;
    readonly plantId: string | null;
    readonly plantName: string | null;
    /** Historical/archive label; never infer an active current grow from this context. */
    readonly targetArchived: boolean;
  };
  readonly profile: {
    readonly stage: string | null;
    readonly strain: string | null;
    readonly medium: string | null;
    readonly potSize: string | null;
    readonly growType: string | null;
    readonly plantType: string | null;
    readonly plantStatus: string | null;
  };
  readonly evidence: {
    readonly recentEvents: readonly GrowWalkEventEvidence[];
    readonly sensors: GrowWalkSensorEvidence;
    readonly photos: readonly GrowWalkPhotoMetadata[];
    readonly alerts: readonly GrowWalkAlertEvidence[];
    readonly aiDoctor: GrowWalkAiDoctorEvidence | null;
    readonly actionQueue: GrowWalkActionQueueEvidence;
  };
  readonly derived: GrowWalkEvidenceDerivation & {
    readonly attentionBand: GrowWalkAttentionBand;
  };
  readonly receipt: {
    readonly generatedAt: string;
    readonly lookbackHours: number;
    readonly contextVersion: typeof GROW_WALK_CONTEXT_VERSION;
    readonly partialLanes: readonly GrowWalkEvidenceLane[];
    readonly truncatedLanes: readonly GrowWalkEvidenceLane[];
  };
}

/** Pure closeout note composer for guided Obs|Interp|Action fields. Omits empty optional sections; never invents content. */
export function composeGrowWalkCloseoutNote(input: {
  observation: string;
  interpretation?: string;
  action?: string;
  nextCheckpoint?: string;
}): string {
  const observation = (input.observation ?? "").trim();
  const interpretation = (input.interpretation ?? "").trim();
  const action = (input.action ?? "").trim();
  const nextCheckpoint = (input.nextCheckpoint ?? "").trim();

  const lines: string[] = [];
  if (observation) lines.push(`Observation: ${observation}`);
  if (interpretation) lines.push(`Interpretation: ${interpretation}`);
  if (action) lines.push(`Action: ${action}`);
  if (nextCheckpoint) lines.push(`Next checkpoint: ${nextCheckpoint}`);
  return lines.join("\n").trim();
}

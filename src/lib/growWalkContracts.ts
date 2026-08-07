import type { McpSensorReading } from "./operatorAccountReadModels";

export const GROW_WALK_CONTEXT_VERSION = "grow-walk-v0.1" as const;

export const GROW_WALK_ATTENTION_BANDS = [
  "immediate_physical_verification",
  "watch_today",
  "routine_observation",
  "insufficient_evidence",
] as const;

export const GROW_WALK_REASON_CODES = [
  "active_high_alert_needs_confirmation",
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

export type GrowWalkAiDoctorPosture =
  | "not_needed"
  | "wait_for_missing_evidence"
  | "recommended"
  | "cannot_assess_reliably";

export type GrowWalkActionQueuePosture =
  | "none"
  | "existing_item_review"
  | "draft_suggestion_only";

export type GrowWalkEvidenceLane =
  | "profile"
  | "events"
  | "sensors"
  | "photos"
  | "alerts"
  | "ai_doctor"
  | "action_queue";

export interface GrowWalkEventEvidence {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly source: string;
  readonly noteExcerpt: string | null;
  readonly isMajorChange: boolean;
  readonly response: "better" | "same" | "worse" | null;
}

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
  readonly status: string;
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

export interface GrowWalkActionQueueEvidence {
  readonly openCount: number;
  readonly items: readonly {
    readonly id: string;
    readonly status: string;
    readonly riskLevel: string;
    readonly reasonExcerpt: string;
    readonly createdAt: string;
  }[];
}

export interface GrowWalkSensorEvidence {
  readonly available: boolean;
  readonly readings: Readonly<Record<string, McpSensorReading>>;
  /** Metrics whose independently sourced readings conflict after normalization. */
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
}

export interface GrowWalkContext {
  readonly scope: {
    readonly growId: string;
    readonly growName: string;
    readonly tentId: string | null;
    readonly tentName: string | null;
    readonly plantId: string | null;
    readonly plantName: string | null;
  };
  readonly profile: {
    readonly stage: string | null;
    readonly strain: string | null;
    readonly medium: string | null;
    readonly potSize: string | null;
    readonly growType: string | null;
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

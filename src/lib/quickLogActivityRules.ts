/**
 * quickLogActivityRules — pure helpers over QUICK_LOG_ACTIVITY_DEFINITIONS.
 *
 * No I/O, no RPC, no persistence. Callers use these to decide which
 * existing safe persistence path to invoke; this module never invokes
 * anything.
 *
 * Slice: Verdant Quick Log Activity Types v1a — no schema change.
 */

import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  type QuickLogActivityDefinition,
  type QuickLogActivityId,
  type QuickLogEventTypeValue,
  type QuickLogSaveRouteKind,
} from "@/constants/quickLogActivityTypes";
import {
  evaluateHarvestStageEligibility,
  type HarvestStageEligibility,
} from "@/lib/quickLogStageDefaultRules";

export const QUICK_LOG_HARVEST_STAGE_DISABLED_REASON =
  "Harvest logging becomes available in Flower, Flush, or Harvest stages.";

export const QUICK_LOG_TARGET_CHANGED_REASON =
  "The Quick Log target changed. Choose the activity again before saving.";

export const QUICK_LOG_PRIMARY_ACTIVITY_IDS = Object.freeze([
  "note",
  "photo",
  "watering",
  "feeding",
  "environment_check",
  "issue_observation",
] as const satisfies readonly QuickLogActivityId[]);

export const QUICK_LOG_ADDITIONAL_ACTIVITY_IDS = Object.freeze([
  "training",
  "defoliation",
  "manual_sensor_snapshot",
  "harvest",
] as const satisfies readonly QuickLogActivityId[]);

export interface QuickLogActivityPickerItem {
  activity: QuickLogActivityDefinition;
  disabled: boolean;
  disabledReason: string | null;
  harvestEligibility: HarvestStageEligibility | null;
}

export interface QuickLogActivityPickerViewModel {
  primaryActivities: readonly QuickLogActivityPickerItem[];
  additionalActivities: readonly QuickLogActivityPickerItem[];
}

export interface QuickLogActivityPickerViewModelInput {
  plantStage?: unknown;
  hiddenIds?: readonly QuickLogActivityId[];
}

export interface QuickLogTargetIdentityInput {
  growId?: string | null;
  tentId?: string | null;
  plantId?: string | null;
}

export interface QuickLogTargetIdentity {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
}

export interface QuickLogActivityDraftBinding {
  activityId: QuickLogActivityId;
  target: QuickLogTargetIdentity;
  targetKey: string;
}

export interface QuickLogPrePersistenceGateInput {
  activityId: QuickLogActivityId;
  /** Stage read from the current selected plant immediately before saving. */
  currentPlantStage?: unknown;
  /** Exact target captured when this activity draft was selected. */
  selectedTarget: QuickLogTargetIdentityInput | null;
  /** Target currently shown by the presenter immediately before saving. */
  currentTarget: QuickLogTargetIdentityInput | null;
}

export interface QuickLogPrePersistenceGateResult {
  allowed: boolean;
  blockedReason: string | null;
}

/** Normalize optional target fields so null and partial inputs compare stably. */
export function buildQuickLogTargetIdentity(
  input: QuickLogTargetIdentityInput | null | undefined,
): QuickLogTargetIdentity {
  return {
    growId: input?.growId ?? null,
    tentId: input?.tentId ?? null,
    plantId: input?.plantId ?? null,
  };
}

/** Unambiguous deterministic key for target-change detection in presenters. */
export function buildQuickLogTargetKey(
  input: QuickLogTargetIdentityInput | null | undefined,
): string {
  const target = buildQuickLogTargetIdentity(input);
  return JSON.stringify([target.growId, target.tentId, target.plantId]);
}

/** Bind a new activity draft to the exact target visible at selection time. */
export function bindQuickLogActivityDraft(
  activityId: QuickLogActivityId,
  targetInput: QuickLogTargetIdentityInput | null | undefined,
): QuickLogActivityDraftBinding {
  const target = buildQuickLogTargetIdentity(targetInput);
  return {
    activityId,
    target,
    targetKey: buildQuickLogTargetKey(target),
  };
}

/**
 * Resolve one activity's current UI/save availability.
 *
 * Harvest deliberately reuses the canonical stage evaluator. Missing,
 * unrecognized, early, and post-harvest context all fail closed. Other
 * activities preserve their taxonomy-level availability.
 */
export function evaluateQuickLogActivityAvailability(
  activityId: QuickLogActivityId,
  plantStage: unknown,
): QuickLogActivityPickerItem {
  const activity = QUICK_LOG_ACTIVITY_DEFINITIONS[activityId];
  const harvestEligibility =
    activityId === "harvest"
      ? evaluateHarvestStageEligibility(plantStage)
      : null;
  const stageBlocked = harvestEligibility?.eligible === false;
  const disabled = !activity.enabled || stageBlocked;
  let disabledReason: string | null = null;
  if (!activity.enabled) {
    disabledReason = activity.disabledReason ?? null;
  } else if (stageBlocked) {
    disabledReason = QUICK_LOG_HARVEST_STAGE_DISABLED_REASON;
  }

  return {
    activity,
    disabled,
    disabledReason,
    harvestEligibility,
  };
}

/**
 * Fail-closed fence for the last moment before a Quick Log persistence call.
 *
 * This intentionally accepts current context instead of selection-time
 * context. A Harvest selected while eligible therefore cannot remain eligible
 * after the selected plant or its stage changes.
 */
export function evaluateQuickLogPrePersistenceGate({
  activityId,
  currentPlantStage,
  selectedTarget,
  currentTarget,
}: QuickLogPrePersistenceGateInput): QuickLogPrePersistenceGateResult {
  if (
    !selectedTarget ||
    buildQuickLogTargetKey(selectedTarget) !==
      buildQuickLogTargetKey(currentTarget)
  ) {
    return {
      allowed: false,
      blockedReason: QUICK_LOG_TARGET_CHANGED_REASON,
    };
  }

  const availability = evaluateQuickLogActivityAvailability(
    activityId,
    currentPlantStage,
  );

  return {
    allowed: !availability.disabled,
    blockedReason: availability.disabled ? availability.disabledReason : null,
  };
}

/**
 * Build the deterministic picker presentation without duplicating taxonomy
 * or stage vocabulary in JSX.
 */
export function buildQuickLogActivityPickerViewModel({
  plantStage,
  hiddenIds,
}: QuickLogActivityPickerViewModelInput): QuickLogActivityPickerViewModel {
  const hidden = new Set(hiddenIds ?? []);
  const buildGroup = (ids: readonly QuickLogActivityId[]) =>
    ids
      .filter((id) => !hidden.has(id))
      .map((id) => evaluateQuickLogActivityAvailability(id, plantStage));

  return {
    primaryActivities: buildGroup(QUICK_LOG_PRIMARY_ACTIVITY_IDS),
    additionalActivities: buildGroup(QUICK_LOG_ADDITIONAL_ACTIVITY_IDS),
  };
}

export function getQuickLogActivity(
  id: QuickLogActivityId,
): QuickLogActivityDefinition {
  return QUICK_LOG_ACTIVITY_DEFINITIONS[id];
}

export function isQuickLogActivityEnabled(id: QuickLogActivityId): boolean {
  return QUICK_LOG_ACTIVITY_DEFINITIONS[id].enabled;
}

export function getQuickLogDisabledReason(
  id: QuickLogActivityId,
): string | null {
  const def = QUICK_LOG_ACTIVITY_DEFINITIONS[id];
  return def.enabled ? null : def.disabledReason ?? null;
}

export interface QuickLogPersistencePlan {
  activityId: QuickLogActivityId;
  saveRoute: QuickLogSaveRouteKind;
  /** p_action passed to quicklog_save_manual for the note route. */
  manualAction?: "note";
  /** event_type passed to quicklog_save_event, when saveRoute === "event". */
  eventType?: QuickLogEventTypeValue;
  /** Metadata subtype fence to include in event details, when applicable. */
  detailsSubtype?: string;
}

/**
 * Resolve the persistence plan for an activity. Returns `null` for
 * taxonomy-disabled activities so callers cannot accidentally fake-save
 * them. Contextual Harvest eligibility is enforced by the stage-aware
 * picker/section rules before this persistence-only planner is called.
 */
export function planQuickLogPersistence(
  id: QuickLogActivityId,
): QuickLogPersistencePlan | null {
  const def = QUICK_LOG_ACTIVITY_DEFINITIONS[id];
  if (!def.enabled) return null;
  switch (def.saveRoute) {
    case "manual_note":
      return {
        activityId: id,
        saveRoute: "manual_note",
        manualAction: "note",
      };
    case "structured_water":
      return {
        activityId: id,
        saveRoute: "structured_water",
      };
    case "event":
      if (!def.eventType) return null;
      return {
        activityId: id,
        saveRoute: "event",
        eventType: def.eventType,
        detailsSubtype: def.detailsSubtype,
      };
    case "manual_sensor_reading":
      return { activityId: id, saveRoute: "manual_sensor_reading" };
    case "none":
      return null;
  }
}

/**
 * Timeline label resolver for events persisted via quicklog_save_event.
 *
 * Defoliation is a subtype fence over `event_type: training` — we only
 * label a card "Defoliation" when both event_type is "training" and
 * details.subtype is "defoliation". Generic training stays labeled
 * "Training" so a plain training log is never mislabeled.
 */
export function resolveQuickLogEventTimelineLabel(input: {
  eventType: string | null | undefined;
  detailsSubtype?: string | null | undefined;
}): string {
  const eventType = (input.eventType ?? "").toString().trim().toLowerCase();
  const subtype = (input.detailsSubtype ?? "").toString().trim().toLowerCase();
  if (eventType === "training" && subtype === "defoliation") {
    return QUICK_LOG_ACTIVITY_DEFINITIONS.defoliation.timelineLabel;
  }
  switch (eventType) {
    case "training":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.training.timelineLabel;
    case "feeding":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.feeding.timelineLabel;
    case "watering":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.watering.timelineLabel;
    case "photo":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.photo.timelineLabel;
    case "environment":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.environment_check.timelineLabel;
    case "observation":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.issue_observation.timelineLabel;
    case "harvest":
      return QUICK_LOG_ACTIVITY_DEFINITIONS.harvest.timelineLabel;
    default:
      return "";
  }
}

export { QUICK_LOG_HARVEST_BACKEND_UNAVAILABLE_REASON } from "@/constants/quickLogActivityTypes";

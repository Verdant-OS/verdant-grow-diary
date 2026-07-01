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
  QUICK_LOG_HARVEST_DISABLED_REASON,
  type QuickLogActivityDefinition,
  type QuickLogActivityId,
  type QuickLogEventTypeValue,
  type QuickLogSaveRouteKind,
} from "@/constants/quickLogActivityTypes";

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
  /** p_action passed to quicklog_save_manual, when saveRoute is manual_*. */
  manualAction?: "note" | "water";
  /** event_type passed to quicklog_save_event, when saveRoute === "event". */
  eventType?: QuickLogEventTypeValue;
  /** Metadata subtype fence to include in event details, when applicable. */
  detailsSubtype?: string;
}

/**
 * Resolve the persistence plan for an activity. Returns `null` for
 * disabled activities (Harvest in v1a) so callers cannot accidentally
 * fake-save them.
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
    case "manual_water":
      return {
        activityId: id,
        saveRoute: "manual_water",
        manualAction: "water",
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
    default:
      return "";
  }
}

export { QUICK_LOG_HARVEST_DISABLED_REASON };

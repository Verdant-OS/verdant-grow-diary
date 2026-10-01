import type { QuickLogActivityId } from "@/constants/quickLogActivityTypes";

export const QUICK_LOG_TENT_OPTIONAL_ACTIVITY_IDS = Object.freeze([
  "note",
  "photo",
  "issue_observation",
] as const satisfies readonly QuickLogActivityId[]);

const QUICK_LOG_TENT_OPTIONAL_ACTIVITY_SET = new Set<string>(QUICK_LOG_TENT_OPTIONAL_ACTIVITY_IDS);

export const QUICK_LOG_TENT_OPTIONAL_LEGACY_EVENT_TYPES = Object.freeze([
  "note",
  "photo",
  "observation",
] as const);

const QUICK_LOG_TENT_OPTIONAL_LEGACY_EVENT_TYPE_SET = new Set<string>(
  QUICK_LOG_TENT_OPTIONAL_LEGACY_EVENT_TYPES,
);

export function quickLogActivityRequiresTent(
  activityId: QuickLogActivityId | null | undefined,
): boolean {
  return (
    typeof activityId !== "string" ||
    !QUICK_LOG_TENT_OPTIONAL_ACTIVITY_SET.has(activityId.trim().toLowerCase())
  );
}

export function legacyQuickLogEventRequiresTent(eventType: string | null | undefined): boolean {
  return (
    typeof eventType !== "string" ||
    !QUICK_LOG_TENT_OPTIONAL_LEGACY_EVENT_TYPE_SET.has(eventType.trim().toLowerCase())
  );
}

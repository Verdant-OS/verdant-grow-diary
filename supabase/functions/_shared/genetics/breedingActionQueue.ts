import type { BreedingEventType, BreedingEvent } from "./breedingTypes.ts";
import { suggestBreedingFollowUpActions } from "./breedingActionAdvisor.ts";

export const SUPPORTED_BREEDING_EVENT_TYPES: BreedingEventType[] = [
  "reversal_application",
  "isolation_start",
  "pollination",
  "pollen_shed_observed",
  "stigmas_receptive",
  "cross_harvest",
];

export function isSupportedBreedingEventType(eventType: string): eventType is BreedingEventType {
  return SUPPORTED_BREEDING_EVENT_TYPES.includes(eventType as BreedingEventType);
}

/** Mirrors the shape src/lib/originatingTimelineEventRules.ts normalizes to. Written
 * directly here (rather than imported) because Deno edge functions cannot resolve
 * relative imports into src/lib/ — keep this in sync with that file's `type` field name.
 */
export interface BreedingOriginatingTimelineEventRef {
  id: string;
  type: string | null;
  occurred_at: string | null;
  source: string;
}

export interface BreedingActionQueuePayload {
  grow_id: string;
  plant_id?: string | null;
  tent_id?: string | null;
  action_type: string;
  target_metric?: string | null;
  target_device?: string | null;
  status: string;
  source: string;
  reason: string;
  risk_level: string;
  suggested_change: string;
  originating_timeline_events: BreedingOriginatingTimelineEventRef[];
}

export function buildBreedingActionQueuePayloads(
  event: BreedingEvent,
  growId: string,
  plantId: string | null = null,
  tentId: string | null = null,
): BreedingActionQueuePayload[] {
  if (!isSupportedBreedingEventType(event.type)) {
    return [];
  }

  const occurredDate = new Date(event.occurred_at);
  if (isNaN(occurredDate.getTime())) {
    return [];
  }

  const suggestions = suggestBreedingFollowUpActions(event);

  // Recovers the breeding subtype + original timestamp for
  // calculateBreedingCycleStats (grow_events.event_type cannot carry the
  // subtype). event.type/id/occurred_at are already validated above
  // (isSupportedBreedingEventType + a real Date), so no further
  // normalization is needed here.
  const originatingTimelineEvents: BreedingOriginatingTimelineEventRef[] = [
    { id: event.id, type: event.type, occurred_at: event.occurred_at, source: "manual" },
  ];

  return suggestions.map((suggestion) => {
    // Prepare suggested_change metadata (due_offset_days is preserved here for future expiry logic)
    const suggestedChange = {
      title: suggestion.title,
      next_steps: suggestion.next_steps,
      reason: suggestion.reason,
      due_offset_days: suggestion.due_offset_days,
      source_event_id: event.id,
    };

    return {
      grow_id: growId,
      plant_id: plantId,
      tent_id: tentId,
      action_type: "breeding_follow_up",
      target_metric: "breeding_follow_up",
      status: "pending_approval",
      source: "manual",
      reason: `${suggestion.reason} [event:${event.id}]`,
      risk_level: suggestion.risk_level,
      suggested_change: JSON.stringify(suggestedChange),
      originating_timeline_events: originatingTimelineEvents,
    };
  });
}

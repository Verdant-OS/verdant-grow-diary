import type { Database } from "@/integrations/supabase/types";
import type { BreedingEventType, BreedingEvent } from "./breedingTypes";
import { suggestBreedingFollowUpActions } from "./breedingActionAdvisor";
import { normalizeOriginatingTimelineEvents } from "@/lib/originatingTimelineEventRules";

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

export type ActionQueueInsert = Database["public"]["Tables"]["action_queue"]["Insert"];

export type BreedingActionQueuePayload = ActionQueueInsert;

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
  // subtype — see breedingCycleStatsAdapter.ts). Reuses the same
  // normalizer + safety envelope already exercised by
  // usePersistEnvironmentAlerts.ts for the same column.
  const originatingTimelineEvents = normalizeOriginatingTimelineEvents([
    { id: event.id, type: event.type, occurred_at: event.occurred_at, source: "manual" },
  ]);

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
      // Same cast convention as src/lib/alerts.ts's saveAlert() for this column.
      originating_timeline_events: originatingTimelineEvents as unknown as never,
    };
  });
}

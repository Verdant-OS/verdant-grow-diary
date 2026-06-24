import type { Database } from "@/integrations/supabase/types";
import type { BreedingEventType, BreedingEvent } from "./breedingTypes";
import { suggestBreedingFollowUpActions } from "./breedingActionAdvisor";

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

export interface BreedingActionQueuePayload extends ActionQueueInsert {
  due_at?: string; // Appended since the type might not have it yet
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

  return suggestions.map((suggestion) => {
    // Compute due_at = occurred_at + due_offset_days
    const dueAtDate = new Date(occurredDate);
    dueAtDate.setUTCDate(dueAtDate.getUTCDate() + suggestion.due_offset_days);

    // Prepare suggested_change metadata
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
      status: "pending_approval",
      source: "manual",
      reason: `${suggestion.reason} [event:${event.id}]`,
      risk_level: suggestion.risk_level,
      suggested_change: JSON.stringify(suggestedChange),
      due_at: dueAtDate.toISOString(),
    };
  });
}

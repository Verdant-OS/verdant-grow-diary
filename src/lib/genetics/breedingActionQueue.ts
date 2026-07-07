import type { Database } from "@/integrations/supabase/types";
import type { BreedingEventType, BreedingEvent } from "./breedingTypes";
import { suggestBreedingFollowUpActions, type BreedingEventLike } from "./breedingActionAdvisor";

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

// action_queue has no `due_at` column; the follow-up due date is carried inside
// the `suggested_change` JSON instead. The payload is a plain ActionQueueInsert.
export type BreedingActionQueuePayload = ActionQueueInsert;

function toBreedingEventLike(event: BreedingEvent): BreedingEventLike {
  return {
    ...event,
    event_type: event.type,
    details: (event.details as Record<string, unknown>) || null,
  };
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

  const eventLike = toBreedingEventLike(event);
  const suggestions = suggestBreedingFollowUpActions(eventLike);

  return suggestions.map((suggestion) => {
    // Compute due_at = occurred_at + due_offset_days
    const dueAtDate = new Date(occurredDate);
    dueAtDate.setUTCDate(dueAtDate.getUTCDate() + suggestion.due_offset_days);

    // Prepare suggested_change metadata. The computed due date lives here
    // because action_queue has no dedicated `due_at` column.
    const suggestedChange = {
      title: suggestion.title,
      next_steps: suggestion.next_steps,
      reason: suggestion.reason,
      due_offset_days: suggestion.due_offset_days,
      due_at: dueAtDate.toISOString(),
      source_event_id: event.id,
    };

    return {
      grow_id: growId,
      plant_id: plantId,
      tent_id: tentId,
      action_type: "breeding_follow_up",
      status: "pending_approval",
      source: "manual",
      // Satisfies action_queue_target_present_chk (target_metric OR
      // target_device must be present). Breeding follow-ups are workflow
      // reminders, not device/metric actions, so this is a stable sentinel.
      target_metric: "breeding_workflow",
      reason: `${suggestion.reason} [event:${event.id}]`,
      risk_level: suggestion.risk_level,
      suggested_change: JSON.stringify(suggestedChange),
    };
  });
}

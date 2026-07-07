import type { BreedingEventType, BreedingEvent } from "./breedingTypes.ts";
import { suggestBreedingFollowUpActions, type BreedingEventLike } from "./breedingActionAdvisor.ts";

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

export interface BreedingActionQueuePayload {
  grow_id: string;
  plant_id?: string | null;
  tent_id?: string | null;
  action_type: string;
  status: string;
  source: string;
  target_metric: string;
  reason: string;
  risk_level: string;
  suggested_change: string;
}

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

    // Prepare suggested_change metadata. The due date lives here because
    // action_queue has no dedicated due_at column.
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
      // target_device must be present).
      target_metric: "breeding_workflow",
      reason: `${suggestion.reason} [event:${event.id}]`,
      risk_level: suggestion.risk_level,
      suggested_change: JSON.stringify(suggestedChange),
    };
  });
}

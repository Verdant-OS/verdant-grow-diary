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
// the plain-text `suggested_change` copy. The payload is an ActionQueueInsert.
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
    // Follow-up due date = event date + the advisor's offset. action_queue has
    // no due_at column, so carry it in the readable copy.
    const dueAt = new Date(occurredDate);
    dueAt.setUTCDate(dueAt.getUTCDate() + suggestion.due_offset_days);
    const dueLabel = dueAt.toISOString().slice(0, 10);
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
      // Grower-facing copy — Action Queue / Action Detail render
      // suggested_change + reason verbatim (no JSON parsing). Keep it readable
      // AND preserve the computed due date.
      suggested_change: `${suggestion.title} — by ${dueLabel}`,
      reason: `${suggestion.reason} [event:${event.id}]`,
      risk_level: suggestion.risk_level,
      // Privacy-safe back-reference: only id, type, source, occurred_at —
      // no raw notes, no user_id, no device data, no secret-like fields.
      originating_timeline_events: [
        {
          id: event.id,
          type: event.type,
          source: "manual",
          occurred_at: event.occurred_at,
        },
      ],
    };
  });
}

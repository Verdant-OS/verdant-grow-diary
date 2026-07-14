import type { Database } from "@/integrations/supabase/types";
import type { BreedingEventType, BreedingEvent } from "./breedingTypes";
<<<<<<< HEAD
import { suggestBreedingFollowUpActions } from "./breedingActionAdvisor";
import { normalizeOriginatingTimelineEvents } from "@/lib/originatingTimelineEventRules";
=======
import { suggestBreedingFollowUpActions, type BreedingEventLike } from "./breedingActionAdvisor";
>>>>>>> origin/main

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

<<<<<<< HEAD
export type BreedingActionQueuePayload = ActionQueueInsert;
=======
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
>>>>>>> origin/main

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

<<<<<<< HEAD
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

=======
  return suggestions.map((suggestion) => {
    // Follow-up due date = event date + the advisor's offset. action_queue has
    // no due_at column, so carry it in the readable copy.
    const dueAt = new Date(occurredDate);
    dueAt.setUTCDate(dueAt.getUTCDate() + suggestion.due_offset_days);
    const dueLabel = dueAt.toISOString().slice(0, 10);
>>>>>>> origin/main
    return {
      grow_id: growId,
      plant_id: plantId,
      tent_id: tentId,
      action_type: "breeding_follow_up",
      target_metric: "breeding_follow_up",
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
<<<<<<< HEAD
      suggested_change: JSON.stringify(suggestedChange),
      // Same cast convention as src/lib/alerts.ts's saveAlert() for this column.
      originating_timeline_events: originatingTimelineEvents as unknown as never,
=======
>>>>>>> origin/main
    };
  });
}

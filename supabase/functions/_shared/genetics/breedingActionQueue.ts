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

export interface OriginatingTimelineEventRef {
  id: string;
  type: string;
  source: string;
  occurred_at: string;
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
  originating_timeline_events?: OriginatingTimelineEventRef[];
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
      // target_device must be present).
      target_metric: "breeding_workflow",
      // Grower-facing copy — Action Queue / Action Detail render
      // suggested_change + reason verbatim (no JSON parsing). Keep it readable
      // AND preserve the computed due date.
      suggested_change: `${suggestion.title} — by ${dueLabel}`,
      reason: `${suggestion.reason} [event:${event.id}]`,
      risk_level: suggestion.risk_level,
      // Privacy-safe back-reference: only id, type, source, occurred_at —
      // no raw notes, no user_id, no device data, no secret-like fields.
      // Mirrors the browser copy (src/lib/genetics/breedingActionQueue.ts) so
      // the /breeding/new production write path (create-breeding-suggestions)
      // links each follow-up back to its originating timeline event —
      // adaptActionQueueRowsToBreedingCycleTimelinePoints skips rows without it.
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

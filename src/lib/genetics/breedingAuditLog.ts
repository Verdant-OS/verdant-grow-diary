export type BreedingAuditEventType =
  | "breeding_suggestion_created"
  | "breeding_suggestion_viewed"
  | "breeding_suggestion_approved"
  | "breeding_suggestion_declined"
  | "breeding_suggestion_expired";

export interface BreedingAuditPayload {
  eventType: BreedingAuditEventType;
  actionId?: string | null;
  plantId?: string | null;
  source?: string | null;
  status?: string | null;
  actorId?: string | null;
  timestamp?: string | null;
  requiresApproval?: boolean | null;
}

export function emitBreedingAuditEvent(payload: BreedingAuditPayload): BreedingAuditPayload {
  console.info("[breeding-audit]", payload.eventType, {
    actionId: payload.actionId ?? null,
    plantId: payload.plantId ?? null,
    source: payload.source ?? null,
    status: payload.status ?? null,
    actorId: payload.actorId ?? null,
    timestamp: payload.timestamp ?? null,
    requiresApproval: payload.requiresApproval ?? null,
  });
  return payload;
}

export function isBreedingFollowUpAction(actionType: string): boolean {
  return actionType === "breeding_follow_up";
}

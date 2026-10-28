import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";

export interface ExpectedQuickLogActivityEvent {
  id: string;
  eventType: string;
  growId: string;
  /** Omitted only when a plant-targeted manual Note RPC resolved its tent server-side. */
  tentId?: string | null;
  plantId: string | null;
  note: string | null;
  occurredAt: string | null;
}

/** A plant-targeted manual Note makes no tent claim; the RPC resolves that field. */
export function resolveManualNoteReceiptTentId(
  input: { plantId?: string | null; tentId?: string | null } | null | undefined,
): string | null | undefined {
  if (input?.plantId) return undefined;
  return input?.tentId ?? null;
}

/** A reused ID confirms only the original, still-visible activity. */
export function matchesActiveQuickLogActivityEvent(
  expected: ExpectedQuickLogActivityEvent,
  value: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (
    event.id !== expected.id ||
    event.event_type !== expected.eventType ||
    event.source !== "manual" ||
    event.is_deleted !== false ||
    event.grow_id !== expected.growId ||
    (expected.tentId !== undefined && event.tent_id !== expected.tentId) ||
    event.plant_id !== expected.plantId ||
    event.note !== expected.note
  )
    return false;
  if (expected.occurredAt === null) return true;
  const expectedTime = Date.parse(expected.occurredAt);
  const actualTime =
    typeof event.occurred_at === "string" ? Date.parse(event.occurred_at) : Number.NaN;
  return Number.isFinite(expectedTime) && expectedTime === actualTime;
}

export function hasMatchingQuickLogNoteTarget(
  payload: Pick<QuickLogV2SavePayload, "p_target_type" | "p_target_id">,
  eventId: string,
  value: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (event.id !== eventId) return false;
  if (payload.p_target_type === "plant") return event.plant_id === payload.p_target_id;
  if (payload.p_target_type === "tent")
    return event.tent_id === payload.p_target_id && event.plant_id === null;
  return false;
}

/** A reused Note can be acknowledged only if its parent event is still active. */
export function matchesActiveQuickLogNoteEvent(
  payload: Pick<QuickLogV2SavePayload, "p_target_type" | "p_target_id">,
  eventId: string,
  value: unknown,
): boolean {
  if (!hasMatchingQuickLogNoteTarget(payload, eventId, value)) return false;
  const event = value as Record<string, unknown>;
  return (
    event.event_type === "observation" && event.source === "manual" && event.is_deleted === false
  );
}

export type TypedQuickLogEventType = "watering" | "feeding";

export interface ExpectedTypedQuickLogEvent {
  id: string;
  eventType: TypedQuickLogEventType;
  growId: string;
  tentId: string | null;
  plantId: string | null;
  volumeMl: number;
  lineId?: string;
}

export function matchesTypedQuickLogChild(
  expected: ExpectedTypedQuickLogEvent,
  value: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Number.isFinite(expected.volumeMl) || expected.volumeMl <= 0) return false;
  const child = value as Record<string, unknown>;
  return (
    child.event_id === expected.id &&
    child.volume_ml === expected.volumeMl &&
    (expected.eventType === "watering" ||
      (typeof expected.lineId === "string" &&
        expected.lineId.length > 0 &&
        child.line_id === expected.lineId))
  );
}

export function matchesActiveTypedQuickLogEvent(
  expected: ExpectedTypedQuickLogEvent,
  value: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    event.id === expected.id &&
    event.event_type === expected.eventType &&
    event.source === "manual" &&
    event.is_deleted === false &&
    event.grow_id === expected.growId &&
    event.tent_id === expected.tentId &&
    event.plant_id === expected.plantId
  );
}

/** A confirmed reused-receipt mismatch: same-key Retry returns it again, so only history review resolves it. */
export type TypedReusedReceiptRefusal =
  | "idempotency_receipt_missing"
  | "idempotency_key_retracted"
  | "receipt_target_moved"
  | "idempotency_key_conflict";

/** Why a readable parent row does not confirm this receipt; null when it does. */
export function typedReusedEventRefusal(
  expected: ExpectedTypedQuickLogEvent,
  value: unknown,
): TypedReusedReceiptRefusal | null {
  if (value === null || value === undefined) return "idempotency_receipt_missing";
  if (matchesActiveTypedQuickLogEvent(expected, value)) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "idempotency_key_conflict";
  const event = value as Record<string, unknown>;
  if (
    event.id !== expected.id ||
    event.event_type !== expected.eventType ||
    event.source !== "manual"
  )
    return "idempotency_key_conflict";
  if (event.is_deleted === true) return "idempotency_key_retracted";
  if (event.is_deleted !== false) return "idempotency_key_conflict";
  return "receipt_target_moved";
}

/** Where a moved parent row lives now, so history review links to the right Timeline. */
export interface TypedReusedReviewTarget {
  growId: string;
  tentId: string | null;
  plantId: string | null;
}

/** The verified current scope of a read-back parent row, or null when it is not well formed. */
export function typedReusedMovedScope(value: unknown): TypedReusedReviewTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  const optional = (v: unknown) => v === null || (typeof v === "string" && v.length > 0);
  if (typeof event.grow_id !== "string" || !event.grow_id) return null;
  if (!optional(event.tent_id) || !optional(event.plant_id)) return null;
  return {
    growId: event.grow_id,
    tentId: event.tent_id as string | null,
    plantId: event.plant_id as string | null,
  };
}

/** Why a readable typed child row does not confirm this receipt; null when it does. */
export function typedReusedChildRefusal(
  expected: ExpectedTypedQuickLogEvent,
  value: unknown,
): TypedReusedReceiptRefusal | null {
  if (value === null || value === undefined) return "idempotency_receipt_missing";
  return matchesTypedQuickLogChild(expected, value) ? null : "idempotency_key_conflict";
}

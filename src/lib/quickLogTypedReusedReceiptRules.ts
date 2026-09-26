export type TypedQuickLogEventType = "watering" | "feeding";

export interface ExpectedTypedQuickLogEvent {
  id: string;
  eventType: TypedQuickLogEventType;
  growId: string;
  tentId: string | null;
  plantId: string | null;
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

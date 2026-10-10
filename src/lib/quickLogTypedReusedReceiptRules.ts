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

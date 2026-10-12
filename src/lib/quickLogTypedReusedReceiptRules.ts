/**
 * Postgres `numeric` (watering_events.volume_ml, feeding_events.volume_ml)
 * comes back from PostgREST as a decimal string. A reused receipt must treat
 * "750" and "750.0" as the submitted number 750, and must not coerce junk.
 */
const STORED_VOLUME_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function storedQuickLogVolumeMatches(stored: unknown, expected: number | null): boolean {
  if (expected === null) return stored === null;
  if (typeof expected !== "number" || !Number.isFinite(expected)) return false;
  if (typeof stored === "number") return Number.isFinite(stored) && stored === expected;
  if (typeof stored !== "string") return false;
  const text = stored.trim();
  if (!STORED_VOLUME_TEXT.test(text)) return false;
  const actual = Number(text);
  return Number.isFinite(actual) && actual === expected;
}

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
    storedQuickLogVolumeMatches(child.volume_ml, expected.volumeMl) &&
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

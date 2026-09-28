/**
 * diaryLinkedEventTypeRules — recover a diary mirror's action type from the
 * grow_events row it is linked to.
 *
 * QA 2026-09-24: a Quick Log watering showed as "NOTE" in Plant Detail's
 * Recent activity. `quicklog_save_manual` records the action on the
 * grow_events spine (event_type 'watering') and mirrors a diary row whose
 * details carry `linked_grow_event_id` but no type, so every diary-only
 * reader defaulted the row to "note".
 *
 * The type is taken from the linked spine row — server-recorded truth — and
 * never inferred from note text. Only rows with no real type are touched; a
 * row that already names a canonical type is never overridden, and a spine
 * type outside the server-validated Quick Log list is ignored.
 *
 * Pure: no I/O, no clock. Rows that need no change are returned as-is.
 */

/**
 * Mirrors the server-validated quicklog event types that diaryEntryRules
 * accepts from `details.event_type` (QUICK_LOG_DETAILS_EVENT_TYPES there;
 * that module is edge-mirrored, so the list is restated rather than exported).
 */
export const LINKED_SPINE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "observation",
  "watering",
  "feeding",
  "photo",
  "environment",
  "training",
  "harvest",
  "cure_check",
]);

/** Details `event_type` values that are wrappers, not an action. */
const WRAPPER_DETAIL_TYPES: ReadonlySet<string> = new Set(["quick_log", "note"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function isPlainObject(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function linkedEventId(details: Row): string | null {
  for (const key of ["linked_grow_event_id", "grow_event_id"]) {
    const v = details[key];
    if (typeof v === "string" && UUID_RE.test(v.trim())) return v.trim().toLowerCase();
  }
  return null;
}

/** The linked spine id of a row whose own type is missing or a wrapper. */
function untypedLinkedId(row: unknown): string | null {
  if (!isPlainObject(row)) return null;
  for (const key of ["entry_type", "entryType", "event_type", "eventType", "type"]) {
    if (!blank(row[key])) return null;
  }
  const details = row.details;
  if (!isPlainObject(details)) return null;
  const declared = details.event_type ?? details.eventType;
  if (!blank(declared) && !WRAPPER_DETAIL_TYPES.has(String(declared).toLowerCase().trim())) {
    return null;
  }
  return linkedEventId(details);
}

/** Unique spine ids to look up, in first-seen order. */
export function collectLinkedEventIdsNeedingType(rows: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = untypedLinkedId(row);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Stamp the spine's event type into each untyped linked row's details. */
export function applyLinkedEventTypes<T>(
  rows: readonly T[],
  spineTypes: ReadonlyMap<string, unknown>,
): T[] {
  return rows.map((row) => {
    const id = untypedLinkedId(row);
    if (!id) return row;
    const raw = spineTypes.get(id);
    const type = typeof raw === "string" ? raw.toLowerCase().trim() : "";
    if (!LINKED_SPINE_EVENT_TYPES.has(type)) return row;
    const r = row as unknown as Row;
    return { ...r, details: { ...(r.details as Row), event_type: type } } as unknown as T;
  });
}

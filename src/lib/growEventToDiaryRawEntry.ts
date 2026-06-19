/**
 * Map a `grow_events` row into the loose "raw entry" shape consumed by
 * `normalizeDiaryEntries` / `buildRecentQuickLogActivity`, so the /logs
 * "Recent Quick Logs" panel can surface Quick Log v2 manual saves
 * alongside legacy `diary_entries` rows.
 *
 * Read-only mapping. No I/O. No invented fields. No source label changes:
 *   - source stays as the row's recorded source (e.g. "manual").
 *   - occurred_at is mapped to `entry_at` so the existing newest-first
 *     sort key matches what the user saved.
 *   - is_deleted rows are filtered out by the caller.
 *
 * Safety:
 *   - Never writes.
 *   - Never invents live/sensor labels.
 *   - Pure / deterministic.
 */
import { splitHardwareReadingsFromNote } from "@/lib/quickLogHardwareReadingsDisplayRules";

export interface GrowEventRowForRecent {
  id: string;
  grow_id?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  event_type: string;
  occurred_at: string;
  note?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
}

export interface RecentLaneRawEntry {
  id: string;
  grow_id?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  stage?: string | null;
  entry_type: string;
  entry_at: string;
  note: string;
  photo_url?: string | null;
  details: Record<string, unknown>;
}

function normalizedTimestamp(value: string | null | undefined): string {
  if (!value) return "";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value.trim();
  return new Date(ms).toISOString();
}

function normalizedBaseNote(value: string | null | undefined): string {
  return splitHardwareReadingsFromNote(value).body.replace(/\s+/g, " ").trim();
}

function entryEventType(entry: Pick<RecentLaneRawEntry, "entry_type" | "details">): string {
  const detailType = entry.details?.event_type;
  return typeof detailType === "string" && detailType.trim()
    ? detailType.trim()
    : entry.entry_type;
}

function companionKey(parts: {
  plant_id?: string | null;
  tent_id?: string | null;
  entry_at: string;
  entry_type: string;
  note: string | null | undefined;
}): string {
  return [
    parts.plant_id ?? "",
    parts.tent_id ?? "",
    normalizedTimestamp(parts.entry_at),
    parts.entry_type,
    normalizedBaseNote(parts.note),
  ].join("\u001f");
}

function diaryCompanionKey(entry: RecentLaneRawEntry): string {
  return companionKey({
    plant_id: entry.plant_id,
    tent_id: entry.tent_id,
    entry_at: entry.entry_at,
    entry_type: entryEventType(entry),
    note: entry.note,
  });
}

function growEventCompanionKey(row: GrowEventRowForRecent): string {
  return companionKey({
    plant_id: row.plant_id,
    tent_id: row.tent_id,
    entry_at: row.occurred_at,
    entry_type: row.event_type,
    note: row.note,
  });
}

export function mapGrowEventToRecentRawEntry(
  row: GrowEventRowForRecent,
): RecentLaneRawEntry {
  return {
    id: row.id,
    grow_id: row.grow_id ?? null,
    plant_id: row.plant_id ?? null,
    tent_id: row.tent_id ?? null,
    entry_type: row.event_type,
    entry_at: row.occurred_at,
    note: row.note ?? "",
    details: {
      event_type: row.event_type,
      source: row.source ?? null,
    },
  };
}

export function mapGrowEventsToRecentRawEntries(
  rows: ReadonlyArray<GrowEventRowForRecent>,
): RecentLaneRawEntry[] {
  return rows
    .filter((r) => r && r.id && r.occurred_at && r.is_deleted !== true)
    .map(mapGrowEventToRecentRawEntry);
}

/**
 * Recent Quick Logs receives two read streams: legacy/rich `diary_entries`
 * rows and Quick Log v2 `grow_events` rows. A manual Quick Log save may
 * legitimately create a parent grow_event plus a richer companion diary row
 * at the same plant/tent/timestamp/event type. Render the richer diary row
 * once and suppress only that mapped parent event.
 */
export function buildRecentLaneRawEntries(
  diaryRows: ReadonlyArray<RecentLaneRawEntry>,
  growEventRows: ReadonlyArray<GrowEventRowForRecent>,
): RecentLaneRawEntry[] {
  const companionKeys = new Set(diaryRows.map(diaryCompanionKey));
  const mappedGrowEvents = growEventRows
    .filter((row) => !companionKeys.has(growEventCompanionKey(row)))
    .map(mapGrowEventToRecentRawEntry);

  return [...diaryRows, ...mappedGrowEvents];
}

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
  grow_id: string | null;
  plant_id: string | null;
  tent_id: string | null;
  entry_type: string;
  entry_at: string;
  note: string;
  details: { event_type: string; source: string | null };
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

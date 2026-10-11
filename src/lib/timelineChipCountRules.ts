/**
 * Timeline chip counts — diary rows only, photos from the original reference.
 *
 * Synthetic sensor receipts stay in the visible list. They are not diary
 * rows, so they do not move All, Photos, Notes, or the other event chips.
 * A storage photo counts as soon as the saved reference is known, including
 * while its signed URL is still outstanding.
 *
 * Pure: no React, no Supabase, no clock.
 */
import { parseDiaryPhotoDisplayReferenceFromRow } from "@/lib/diaryPhotoDisplayRules";
import { isTimelineSensorDerivedDiaryId } from "@/lib/timelineManualSensorMeasurementRules";

export const EMPTY_TIMELINE_DIARY_PHOTO_IDS: ReadonlySet<string> = new Set();

export interface TimelinePhotoIdentityRow {
  id: string;
  photo_url?: unknown;
  details?: unknown;
}

/** Diary rows that event and stage chips may count. Receipts are excluded. */
export function timelineDiaryRowsForChipCounts<T extends { id: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isTimelineSensorDerivedDiaryId(row.id));
}

/**
 * Ids whose saved photo reference is displayable. Call this on the rows
 * returned by the diary read, before storage paths are cleared for signing.
 */
export function collectTimelineDiaryPhotoIds(
  rows: readonly TimelinePhotoIdentityRow[],
  viewerUserId: string | null,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    if (isTimelineSensorDerivedDiaryId(row.id)) continue;
    const reference = parseDiaryPhotoDisplayReferenceFromRow(
      { photo_url: row.photo_url, details: row.details },
      { viewerUserId },
    );
    if (reference.kind === "external" || reference.kind === "storage") ids.add(row.id);
  }
  return ids;
}

/** Union page ids without mutating the previous set. */
export function unionTimelineDiaryPhotoIds(
  current: ReadonlySet<string>,
  incoming: ReadonlySet<string>,
): ReadonlySet<string> {
  if (incoming.size === 0) return current;
  const next = new Set(current);
  let added = false;
  for (const id of incoming) {
    if (next.has(id)) continue;
    next.add(id);
    added = true;
  }
  return added ? next : current;
}

/** A photo chip member: a live display URL, or an original reference still unsigned. */
export function timelineEntryCountsAsPhoto(
  entry: { id: string; photo_url?: string | null },
  diaryPhotoIds: ReadonlySet<string>,
): boolean {
  if (entry.photo_url) return true;
  return diaryPhotoIds.has(entry.id);
}

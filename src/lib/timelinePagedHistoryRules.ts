/**
 * Timeline paged-history rules (audit 2026-11-11).
 *
 * Timeline reads the newest page of diary rows and pages older ones on
 * request. A same-scope refresh (a save, a new sensor reading) refetches only
 * the newest page; these rules keep the older pages the grower already loaded
 * instead of sending them back to the top, and say so when the activity
 * history is not the whole history.
 *
 * Pure: no React, no Supabase, no clock.
 */
import { isOlderThanCursor, type TimelineKeysetCursor } from "@/lib/timelineQueryOrderRules";

export interface TimelinePagedRow {
  id: string;
  entry_at: string;
}

export interface TimelineRefreshMergeInput<T extends TimelinePagedRow> {
  /** The rows on screen were read for the same owner/grow/date-range key. */
  sameScope: boolean;
  previousRows: readonly T[];
  previousCursor: TimelineKeysetCursor | null;
  /** Fetched rows the page projection hid, across every page loaded so far. */
  previousHiddenRows: readonly TimelinePagedRow[];
  firstPageRows: readonly T[];
  firstPageCursor: TimelineKeysetCursor | null;
  firstPageHiddenRows: readonly TimelinePagedRow[];
}

export interface TimelineRefreshMerge<T extends TimelinePagedRow> {
  rows: T[];
  /** Oldest fetched row after the merge; the next keyset cursor. */
  cursor: TimelineKeysetCursor | null;
  /** Hidden rows still counted by the server; subtract their number from its count. */
  hiddenRows: TimelinePagedRow[];
  keptOlderPages: boolean;
}

/**
 * Merges a refetched newest page into what is already loaded.
 *
 * Older pages are kept only when the previous read reached strictly past the
 * refreshed page and the refreshed page reaches a row already loaded, so the
 * two are contiguous. Otherwise the refreshed page replaces everything. Rows inside the refreshed page always come from the refresh,
 * so an entry removed elsewhere disappears. A kept older row that was removed
 * elsewhere stays until the next full reload (scope or date-range change).
 */
export function mergeTimelineRefreshedFirstPage<T extends TimelinePagedRow>(
  input: TimelineRefreshMergeInput<T>,
): TimelineRefreshMerge<T> {
  const { previousCursor, firstPageCursor } = input;
  const reachedPastFirstPage =
    input.sameScope &&
    previousCursor !== null &&
    firstPageCursor !== null &&
    isOlderThanCursor({ entry_at: previousCursor.entryAt, id: previousCursor.id }, firstPageCursor);

  // The refreshed page must reach a row already loaded. If everything on
  // screen is older than its last row, more than a page arrived in between
  // and those rows were never fetched; keeping the old cursor would skip them.
  const overlapsLoadedRows =
    firstPageCursor !== null &&
    [...input.previousRows, ...input.previousHiddenRows].some(
      (row) => !isOlderThanCursor(row, firstPageCursor),
    );

  if (!reachedPastFirstPage || !overlapsLoadedRows || firstPageCursor === null) {
    return {
      rows: [...input.firstPageRows],
      cursor: firstPageCursor,
      hiddenRows: [...input.firstPageHiddenRows],
      keptOlderPages: false,
    };
  }

  return {
    rows: [
      ...input.firstPageRows,
      ...input.previousRows.filter((row) => isOlderThanCursor(row, firstPageCursor)),
    ],
    cursor: previousCursor,
    hiddenRows: [
      ...input.firstPageHiddenRows,
      ...input.previousHiddenRows.filter((row) => isOlderThanCursor(row, firstPageCursor)),
    ],
    keptOlderPages: true,
  };
}

/** Fetched rows that the page projection did not show. */
export function timelineHiddenFetchedRows(
  fetched: readonly TimelinePagedRow[] | null | undefined,
  shown: readonly TimelinePagedRow[],
): TimelinePagedRow[] {
  const shownIds = new Set(shown.map((row) => row.id));
  return (fetched ?? [])
    .filter((row) => !shownIds.has(row.id))
    .map((row) => ({ id: row.id, entry_at: row.entry_at }));
}

/**
 * Copy for the Timeline header when the activity history panels hold fewer
 * Quick Log events than the server counted. `null` when nothing is withheld
 * or the count is unknown.
 */
export function timelineActivityTruncationNotice(
  loaded: number,
  total: number | null,
): string | null {
  if (total === null || total <= loaded) return null;
  return `Activity history below shows the newest ${loaded} of ${total} Quick Log events. Set a date range to see older activity.`;
}

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
  /** Server row count for the scope before this refresh, hidden rows included. */
  previousServerCount: number | null;
  /** Server row count returned with the refreshed page, hidden rows included. */
  firstPageServerCount: number | null;
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
 * two are contiguous, and the server's row count changed by exactly the rows
 * that are new on the refreshed page. A count that grew by more means a row
 * landed somewhere the refresh did not read (a save backdated between loaded
 * pages); a count that fell means a row is gone. Either way the kept rows and
 * cursor cannot be trusted. Otherwise the refreshed page replaces everything.
 * Rows inside the refreshed page always come from the refresh, so an entry
 * removed elsewhere disappears. A correction, retraction
 * or removal made on this page is not such a case: the caller passes
 * `sameScope: false` for the reload that follows it, so nothing stale is kept.
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

  // Every row the server now counts must be one already loaded or one on the
  // refreshed page. Otherwise a row sits where no kept page or cursor reaches.
  const loadedIds = new Set(
    [...input.previousRows, ...input.previousHiddenRows].map((row) => row.id),
  );
  const newOnFirstPage = [...input.firstPageRows, ...input.firstPageHiddenRows].filter(
    (row) => !loadedIds.has(row.id),
  ).length;
  const countReconciles =
    input.previousServerCount !== null &&
    input.firstPageServerCount !== null &&
    input.firstPageServerCount - input.previousServerCount === newOnFirstPage;

  if (
    !reachedPastFirstPage ||
    !overlapsLoadedRows ||
    !countReconciles ||
    firstPageCursor === null
  ) {
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

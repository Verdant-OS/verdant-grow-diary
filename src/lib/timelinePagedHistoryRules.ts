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

/** A Quick Log activity row as far as paging is concerned. */
export interface TimelineActivityRow {
  id: string;
  occurred_at: string;
}

/**
 * Keyset cursor for the next older activity page: the oldest loaded row by
 * `(occurred_at, id)`. Computed, not taken from the last array position, so
 * the order rows were appended in cannot move it.
 */
export function timelineActivityCursor(
  rows: readonly TimelineActivityRow[],
): TimelineKeysetCursor | null {
  let cursor: TimelineKeysetCursor | null = null;
  for (const row of rows) {
    if (cursor === null || isOlderThanCursor({ entry_at: row.occurred_at, id: row.id }, cursor)) {
      cursor = { entryAt: row.occurred_at, id: row.id };
    }
  }
  return cursor;
}

/** Appends an older activity page, skipping rows already loaded. */
export function appendTimelineOlderActivity<T extends TimelineActivityRow>(
  loaded: readonly T[],
  olderPage: readonly T[],
): T[] {
  const seen = new Set(loaded.map((row) => row.id));
  return [...loaded, ...olderPage.filter((row) => !seen.has(row.id))];
}

/**
 * Activity counterpart of {@link mergeTimelineRefreshedFirstPage}: a
 * same-scope refresh keeps older activity pages only when the refreshed
 * newest page reaches a row already loaded.
 */
export function mergeTimelineRefreshedActivity<T extends TimelineActivityRow>(input: {
  sameScope: boolean;
  previousRows: readonly T[];
  firstPageRows: readonly T[];
}): { rows: T[]; keptOlderPages: boolean } {
  const wrap = (row: T) => ({ id: row.id, entry_at: row.occurred_at, row });
  const merged = mergeTimelineRefreshedFirstPage({
    sameScope: input.sameScope,
    previousRows: input.previousRows.map(wrap),
    previousCursor: timelineActivityCursor(input.previousRows),
    previousHiddenRows: [],
    firstPageRows: input.firstPageRows.map(wrap),
    firstPageCursor: timelineActivityCursor(input.firstPageRows),
    firstPageHiddenRows: [],
  });
  return { rows: merged.rows.map((item) => item.row), keptOlderPages: merged.keptOlderPages };
}

/**
 * The activity total after an older page was appended. An empty page means
 * the server has nothing older, whatever the earlier count said, so the
 * total drops to what is loaded and the pager stops. The total never falls
 * below the rows actually loaded.
 */
export function timelineActivityTotalAfterOlderPage(
  total: number | null,
  loadedAfter: number,
  pageLength: number,
): number | null {
  if (total === null) return null;
  if (pageLength === 0) return loadedAfter;
  return Math.max(total, loadedAfter);
}

/** Label for the "load older activity" control. */
export function timelineLoadOlderActivityLabel(
  loaded: number,
  total: number,
  loadingOlder: boolean,
): string {
  if (loadingOlder) return "Loading older activity…";
  return `Load older activity (${total - loaded} more)`;
}

export const TIMELINE_LOAD_OLDER_ACTIVITY_ERROR_COPY =
  "Older activity could not be loaded. The activity already shown is unchanged.";

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
  return `Activity history below shows the newest ${loaded} of ${total} Quick Log events. Load older activity, or set a date range.`;
}

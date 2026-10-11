/** Read-only diary pagination and presentation. Counts never come from projection length. */
export const PLANT_RELATIVE_HISTORY_PAGE_SIZE = 10;

export interface PlantHistoryCursor {
  entryAt: string;
  id: string;
}

export interface PlantHistoryPage {
  rows: Record<string, unknown>[];
  totalCount: number | null;
  nextCursor: PlantHistoryCursor | null;
  boundaryUnavailable: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Validate before interpolating a PostgREST filter. Retain DB microseconds verbatim.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function plantHistoryCursorFilter(cursor: PlantHistoryCursor): string {
  if (
    !UUID.test(cursor.id) ||
    !TIMESTAMP.test(cursor.entryAt) ||
    !Number.isFinite(Date.parse(cursor.entryAt))
  ) {
    throw new Error("Older timeline entries are unavailable: invalid page boundary.");
  }
  return `entry_at.lt."${cursor.entryAt}",and(entry_at.eq."${cursor.entryAt}",id.lt."${cursor.id}")`;
}

export function buildPlantHistoryPage(
  data: unknown,
  count: unknown,
  plantId: string,
  pageSize = PLANT_RELATIVE_HISTORY_PAGE_SIZE,
  ownerId?: string | null,
): PlantHistoryPage {
  if (!Array.isArray(data) || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Plant timeline history is unavailable.");
  }
  // A mismatched/malformed response must not borrow another plant's history.
  if (
    data.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        row.plant_id !== plantId ||
        (ownerId != null && row.user_id !== undefined && row.user_id !== ownerId),
    )
  ) {
    throw new Error("Plant timeline history is unavailable.");
  }
  const rows = data.slice(0, pageSize) as Record<string, unknown>[];
  const hasMore = data.length > pageSize;
  const last = rows.at(-1);
  let nextCursor: PlantHistoryCursor | null = null;
  if (hasMore && last) {
    const candidate = { entryAt: String(last.entry_at ?? ""), id: String(last.id ?? "") };
    try {
      plantHistoryCursorFilter(candidate);
      nextCursor = candidate;
    } catch {
      // Retain readable rows, but do not skip an unpageable legacy boundary.
    }
  }
  return {
    rows,
    totalCount:
      typeof count === "number" && Number.isSafeInteger(count) && count >= data.length
        ? count
        : null,
    nextCursor,
    boundaryUnavailable: hasMore && nextCursor === null,
  };
}

export function collectPlantHistoryRows(pages: readonly PlantHistoryPage[] | null | undefined) {
  const seen = new Set<string>();
  return (pages ?? [])
    .flatMap((page) => page.rows)
    .filter((row) => {
      // Retain malformed IDs for an honest raw/projected count discrepancy.
      if (typeof row.id !== "string" || !row.id) return true;
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}

export interface PlantHistoryRead {
  data?: readonly unknown[];
  totalCount?: number | null;
  isPending?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  fetchStatus?: "idle" | "fetching" | "paused";
  hasNextPage?: boolean;
  boundaryUnavailable?: boolean;
}

export function buildPlantHistoryReadView(
  read: PlantHistoryRead,
  plantId: string | null | undefined,
  projectedCount = 0,
  visibleCount = projectedCount,
) {
  const loadedCount = read.data?.length ?? 0;
  const hasData = Array.isArray(read.data);
  const paused = read.fetchStatus === "paused";
  const pending = read.isPending ?? read.isLoading ?? !hasData;
  const refreshing = !!read.isFetching && !read.isFetchingNextPage;
  const countConflict =
    typeof read.totalCount === "number" &&
    Number.isSafeInteger(read.totalCount) &&
    read.totalCount >= 0 &&
    read.totalCount < loadedCount;
  const totalCount =
    typeof read.totalCount === "number" &&
    Number.isSafeInteger(read.totalCount) &&
    read.totalCount >= loadedCount
      ? read.totalCount
      : null;
  const current = hasData && !pending && !paused && !read.isError && !refreshing;
  const complete =
    current &&
    totalCount !== null &&
    loadedCount === totalCount &&
    !read.hasNextPage &&
    !read.boundaryUnavailable;
  const missing = current && totalCount !== null && loadedCount < totalCount && !read.hasNextPage;
  const notice = !plantId
    ? "Select a plant to read its timeline."
    : read.isError
      ? read.isFetchNextPageError
        ? "Older timeline entries could not be loaded. Available entries are retained; retry to continue."
        : "Timeline history is unavailable. Retry to check this plant's entries."
      : paused
        ? "Waiting for connection to load timeline history."
        : pending
          ? "Loading timeline history…"
          : refreshing
            ? "Refreshing timeline history…"
            : countConflict
              ? "Timeline history changed while older entries were loading. Refresh to verify the total."
              : read.boundaryUnavailable || missing
                ? "Some older entries could not be reached. Refresh to check the history again."
                : null;
  const totalSuffix =
    totalCount === null
      ? "total not verified"
      : `${totalCount} total${current ? "" : " at last successful read"}`;
  const countLabel = complete
    ? totalCount === 0
      ? "0 timeline entries"
      : `${totalCount} timeline ${totalCount === 1 ? "entry" : "entries"}`
    : current && totalCount !== null
      ? `Showing ${loadedCount} of ${totalCount} timeline entries`
      : `${loadedCount} loaded timeline entries · ${totalSuffix}`;
  return {
    loadedCount,
    totalCount,
    countConflict,
    current,
    complete,
    // The projection's default preview cap must not truncate loaded history.
    projectionLimit: Math.max(1, loadedCount),
    countLabel,
    notice,
    showHeader: !!plantId && hasData,
    showScopeActions: !plantId,
    showLoading: !!plantId && pending && !hasData && !paused && !read.isError,
    showEmpty: !!plantId && complete && totalCount === 0,
    canRetry:
      !!plantId && (!!read.isError || !!read.boundaryUnavailable || missing || countConflict),
    retryOlder: !!read.isFetchNextPageError,
    showLoadMore: !!read.hasNextPage && !read.isError,
    loadMoreDisabled: paused || !!read.isFetching,
    loadMoreLabel: read.isFetchingNextPage ? "Loading older entries…" : "Load older entries",
    scopeLabel: `Category and filter counts describe the ${projectedCount} readable entries loaded so far.`,
    invalidRowsNotice:
      loadedCount > projectedCount
        ? `${loadedCount - projectedCount} loaded diary ${loadedCount - projectedCount === 1 ? "entry" : "entries"} could not be displayed.`
        : null,
    printCountLabel: `Visible entries: ${visibleCount} from ${loadedCount} loaded diary entries; ${totalSuffix}.`,
  };
}

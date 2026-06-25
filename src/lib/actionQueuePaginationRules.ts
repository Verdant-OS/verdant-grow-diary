/**
 * actionQueuePaginationRules — pure, deterministic pagination helper
 * for the /actions list.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Clamps page safely (never throws) and never invents rows.
 *  - Page size is restricted to a small, explicit allow-list to keep
 *    URL state predictable.
 */

export const ACTION_QUEUE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export type ActionQueuePageSize =
  (typeof ACTION_QUEUE_PAGE_SIZE_OPTIONS)[number];

export const ACTION_QUEUE_DEFAULT_PAGE_SIZE: ActionQueuePageSize = 25;
export const ACTION_QUEUE_DEFAULT_PAGE = 1;

export function isValidPageSize(n: unknown): n is ActionQueuePageSize {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    (ACTION_QUEUE_PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
  );
}

export function clampPageSize(n: unknown): ActionQueuePageSize {
  if (isValidPageSize(n)) return n;
  return ACTION_QUEUE_DEFAULT_PAGE_SIZE;
}

export function clampPage(page: unknown, totalPages: number): number {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const n =
    typeof page === "number" && Number.isFinite(page)
      ? Math.floor(page)
      : ACTION_QUEUE_DEFAULT_PAGE;
  if (n < 1) return 1;
  if (n > safeTotal) return safeTotal;
  return n;
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: ActionQueuePageSize;
  totalItems: number;
  totalPages: number;
  /** 1-based inclusive start index of the visible range, or 0 if empty. */
  rangeStart: number;
  /** 1-based inclusive end index of the visible range, or 0 if empty. */
  rangeEnd: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function paginateActionQueue<T>(
  rows: ReadonlyArray<T>,
  page: number,
  pageSize: number,
): PaginationResult<T> {
  const size = clampPageSize(pageSize);
  const total = Array.isArray(rows) ? rows.length : 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / size);
  const safePage = clampPage(page, totalPages);
  if (total === 0) {
    return {
      items: [],
      page: 1,
      pageSize: size,
      totalItems: 0,
      totalPages: 1,
      rangeStart: 0,
      rangeEnd: 0,
      hasPrev: false,
      hasNext: false,
    };
  }
  const start = (safePage - 1) * size;
  const end = Math.min(start + size, total);
  return {
    items: rows.slice(start, end) as T[],
    page: safePage,
    pageSize: size,
    totalItems: total,
    totalPages,
    rangeStart: start + 1,
    rangeEnd: end,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

/**
 * Decide whether a filter/search/page-size change must reset the page
 * back to 1. Deterministic.
 */
export interface PaginationResetSignals {
  query: string;
  status: string;
  trace: string;
  pageSize: number;
}

export function shouldResetPageOnFilterChange(
  prev: PaginationResetSignals,
  next: PaginationResetSignals,
): boolean {
  if (!prev || !next) return false;
  return (
    prev.query !== next.query ||
    prev.status !== next.status ||
    prev.trace !== next.trace ||
    prev.pageSize !== next.pageSize
  );
}

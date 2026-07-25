/**
 * Pure Action Queue scope rule for URL-scoped archived grows.
 *
 * The grow picker intentionally omits archived grows, but a post-grow report
 * can create an approval-required Action Queue row for one. The queue query is
 * already filtered by the exact `?growId=` and protected by RLS. A non-empty
 * result containing only that grow therefore proves the user may review those
 * rows even when the grow is absent from the active picker.
 *
 * Unknown scopes with no rows remain blocked. Mixed or mismatched rows also
 * fail closed so this rule can never turn an accidentally unscoped result into
 * visible Action Queue data.
 */

export interface ActionQueueScopedGrowRow {
  readonly grow_id: string | null;
}

export interface ShouldBlockActionQueueScopedGrowOptions {
  readonly urlGrowId: string | null;
  readonly isValidScopedGrow: boolean;
  readonly loading: boolean;
  readonly rows: ReadonlyArray<ActionQueueScopedGrowRow>;
}

export function shouldBlockActionQueueScopedGrow(
  options: ShouldBlockActionQueueScopedGrowOptions,
): boolean {
  const { urlGrowId, isValidScopedGrow, loading, rows } = options;

  if (!urlGrowId || isValidScopedGrow || loading) return false;
  if (rows.length === 0) return true;

  return rows.some((row) => row.grow_id !== urlGrowId);
}

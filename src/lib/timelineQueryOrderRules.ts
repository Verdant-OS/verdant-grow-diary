/**
 * Stable ordering for Timeline's bounded reads (#593).
 *
 * A timestamp alone does not totally order rows: entries saved in the same
 * instant tie, and at a `.limit()` boundary the database may return a
 * different subset of the tied rows on each refresh. Adding `id` as a
 * secondary key makes the page deterministic.
 *
 * Pure: it only chains `.order()` on the builder it is given.
 */
export interface OrderableQuery<Q> {
  order(column: string, options: { ascending: boolean }): Q;
}

export function orderNewestFirstStable<Q extends OrderableQuery<Q>>(query: Q, column: string): Q {
  return query.order(column, { ascending: false }).order("id", { ascending: false });
}

/**
 * Keyset cursor for the newest-first `(column desc, id desc)` order above:
 * the oldest row already on screen.
 */
export interface TimelineKeysetCursor {
  entryAt: string;
  id: string;
}

export interface OrFilterableQuery<Q> {
  or(filter: string): Q;
}

/**
 * The next page is every row strictly older than the cursor, or tied on the
 * timestamp with a smaller id. A plain `column < cursor` loses the tied rows
 * the page limit cut off (audit 2026-11-05, F-01).
 */
export function isOlderThanCursor(
  row: { entry_at: string; id: string },
  cursor: TimelineKeysetCursor,
): boolean {
  const rowMs = Date.parse(row.entry_at);
  const cursorMs = Date.parse(cursor.entryAt);
  if (rowMs !== cursorMs) return rowMs < cursorMs;
  return row.id < cursor.id;
}

/** Same predicate as {@link isOlderThanCursor}, as one PostgREST `or` filter.
 *  Values are double-quoted so the timestamptz offset and the uuid parse verbatim. */
export function filterOlderThanCursor<Q extends OrFilterableQuery<Q>>(
  query: Q,
  column: string,
  cursor: TimelineKeysetCursor,
): Q {
  const ts = cursor.entryAt;
  return query.or(`${column}.lt."${ts}",and(${column}.eq."${ts}",id.lt."${cursor.id}")`);
}

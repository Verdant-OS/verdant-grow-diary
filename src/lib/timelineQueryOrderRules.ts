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

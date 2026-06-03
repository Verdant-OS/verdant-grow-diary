/**
 * sortTimeSeriesAscending — shared, pure helper that guarantees time-series
 * chart data renders left-to-right (oldest → newest) regardless of the order
 * returned by the database, API, or caller.
 *
 * Why this exists:
 *   Recharts renders data points in array order. If a query returns rows
 *   `ORDER BY ts DESC` (common for "latest N" loaders) and the caller forgets
 *   to flip them before plotting, the x-axis ends up reversed and the line
 *   appears to flow right-to-left. This helper is the single place to fix
 *   that, so future chart additions cannot reintroduce the bug.
 *
 * Contract:
 *   - Pure: never mutates input.
 *   - Deterministic: equal timestamps preserve original relative order
 *     (stable sort — Array.prototype.sort is stable in modern JS engines).
 *   - Safe: invalid / missing timestamps are sorted to the end rather than
 *     crashing or producing NaN comparisons.
 *   - No I/O, no React, no side effects.
 */
export function sortTimeSeriesAscending<T>(
  points: ReadonlyArray<T> | null | undefined,
  getTimestamp: (point: T) => string | number | Date | null | undefined,
): T[] {
  if (!points || points.length === 0) return [];
  const toEpoch = (p: T): number => {
    const raw = getTimestamp(p);
    if (raw == null) return Number.POSITIVE_INFINITY;
    const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  return [...points].sort((a, b) => toEpoch(a) - toEpoch(b));
}

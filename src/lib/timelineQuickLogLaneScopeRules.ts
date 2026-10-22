/**
 * Scope the Timeline's Quick Log history lanes to the grower's plant/tent
 * filter, using the same exact-id match as the main evidence list
 * (`filterTimelineEvidenceRows`). An empty filter keeps every row.
 *
 * Filming bug #3 (2026-10-22): the lanes were fed the unfiltered grow page,
 * so a one-plant Timeline still listed other plants' quick logs.
 */
export interface TimelineLaneScope {
  plantId?: string | null;
  tentId?: string | null;
}

export function scopeTimelineQuickLogLaneRows<
  T extends { plant_id?: string | null; tent_id?: string | null },
>(rows: readonly T[], scope: TimelineLaneScope): T[] {
  const plantId = scope.plantId?.trim() ?? "";
  const tentId = scope.tentId?.trim() ?? "";
  if (!plantId && !tentId) return [...rows];
  return rows.filter(
    (row) =>
      (!plantId || (row.plant_id ?? "") === plantId) && (!tentId || (row.tent_id ?? "") === tentId),
  );
}

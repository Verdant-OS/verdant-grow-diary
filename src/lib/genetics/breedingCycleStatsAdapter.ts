/**
 * breedingCycleStatsAdapter — bridges `action_queue` rows to the pure
 * calculateBreedingCycleStats input shape.
 *
 * Breeding subtype + the original event timestamp are recovered from
 * `action_queue.originating_timeline_events` (populated by
 * buildBreedingActionQueuePayloads at suggestion-creation time), read via
 * the existing safe adapter in originatingTimelineEventAdapter.ts. Rows
 * with no recoverable ref (e.g. rows written before this write path
 * existed) are silently skipped — this is an expected "no data yet" case,
 * not an error.
 *
 * Callers are responsible for scoping the query that produces these rows
 * (e.g. `.eq("action_type", "breeding_follow_up").eq("grow_id", growId)`,
 * optionally `.eq("plant_id", plantId)`) to a single plant/cross before
 * passing rows here — calculateBreedingCycleStats computes one cycle's
 * stats per call, matching its original tested design.
 *
 * Pure. No I/O, no Supabase, no React.
 */
import { adaptOriginatingTimelineEventsFromRow } from "@/lib/originatingTimelineEventAdapter";
import { isSupportedBreedingEventType } from "./breedingActionQueue";
import type { BreedingCycleTimelinePoint } from "./calculateBreedingCycleStats";

/** Minimal shape needed from an `action_queue` row. */
export interface BreedingCycleActionQueueRow {
  originating_timeline_events?: unknown;
}

/**
 * Adapts a list of `action_queue` rows (already scoped by the caller's
 * query) into `BreedingCycleTimelinePoint[]`, ready for
 * calculateBreedingCycleStats.
 */
export function adaptActionQueueRowsToBreedingCycleTimelinePoints(
  rows: readonly BreedingCycleActionQueueRow[] | null | undefined,
): BreedingCycleTimelinePoint[] {
  if (!Array.isArray(rows)) return [];
  const points: BreedingCycleTimelinePoint[] = [];
  for (const row of rows) {
    const refs = adaptOriginatingTimelineEventsFromRow(row);
    const ref = refs[0];
    if (!ref || !ref.occurred_at) continue;
    if (!ref.type || !isSupportedBreedingEventType(ref.type)) continue;
    points.push({ occurredAt: ref.occurred_at, type: ref.type });
  }
  return points;
}

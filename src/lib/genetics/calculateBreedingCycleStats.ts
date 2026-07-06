/**
 * calculateBreedingCycleStats — pure, deterministic breeding-cycle timing
 * calculator.
 *
 * Rewrite of a June 2026 draft that assumed `grow_events.event_type` carried
 * the breeding subtype (e.g. "pollination"). It never does: grow_events'
 * event_type is trigger-locked to watering/feeding/training/observation/
 * photo/environment/harvest/cure_check, and every breeding row is written as
 * the literal "observation" (see BreedingLogContainer.tsx). The true subtype
 * is recovered instead from `action_queue.originating_timeline_events`
 * (see breedingCycleStatsAdapter.ts for how a row becomes a
 * BreedingCycleTimelinePoint) — this file only does the pure day-math.
 *
 * Kept from the original draft: the chronological-selection algorithm and
 * its 14-case test suite (0-day spans, out-of-order events, invalid dates,
 * partial data — see calculateBreedingCycleStats.test.ts).
 *
 * Dropped from the original draft:
 *  - reversalMethod / pollenIntensity / pollinationMethod: these read from a
 *    per-event `details` payload that does not exist on this data source
 *    (OriginatingTimelineEventRef carries only id/type/occurred_at/source).
 *  - donorPlantId / harvestEventId options: dead no-op parameters. Scoping
 *    to one plant/cross is the caller's query filter, not this function's.
 *  - the fragile `missingEvents` substring-matching completeness check,
 *    replaced with an explicit boolean check on the two computed segments.
 *
 * Pure. No I/O, no Supabase, no React.
 */
import type { BreedingEventType } from "./breedingTypes";

/**
 * One breeding timeline point, already recovered from a persisted source
 * (see breedingCycleStatsAdapter.ts). Represents a single breeding subtype
 * event within one cross/cycle — callers scope the input array to a single
 * plant or cross before calling this function.
 */
export interface BreedingCycleTimelinePoint {
  /** ISO timestamp of the original breeding event. */
  occurredAt: string;
  /** Breeding subtype this point represents. */
  type: BreedingEventType;
}

export type BreedingCycleMissingReason =
  | "reversal_application"
  | "pollen_shed_observed"
  | "pollination"
  | "cross_harvest"
  | "invalid_timestamps";

export interface BreedingCycleStats {
  /** Days from the earliest reversal_application to the first pollen_shed_observed at/after it. */
  reversalToPollenShedDays: number | null;
  /** Days from the earliest pollination to the first cross_harvest at/after it. */
  pollinationToHarvestDays: number | null;
  /** Days from the earliest cycle-start marker (reversal_application, else isolation_start, else pollination) to the harvest used above (else the earliest cross_harvest). */
  totalCycleDays: number | null;
  /** True only when both segment metrics were computed. */
  hasCompleteData: boolean;
  /** What prevented full computation, deduplicated, in no particular order. */
  missingEvents: BreedingCycleMissingReason[];
}

interface TimedPoint {
  type: BreedingEventType;
  occurredAt: string;
  time: number;
}

function parseTime(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function daysBetween(startIso: string, endIso: string): number | null {
  const s = parseTime(startIso);
  const e = parseTime(endIso);
  if (s == null || e == null || e < s) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((e - s) / msPerDay);
}

function earliestAtOrAfter(points: TimedPoint[], atOrAfter: number): TimedPoint | null {
  return points.find((p) => p.time >= atOrAfter) ?? null;
}

export function calculateBreedingCycleStats(
  points: readonly BreedingCycleTimelinePoint[] | unknown,
): BreedingCycleStats {
  const missingEvents = new Set<BreedingCycleMissingReason>();

  if (!Array.isArray(points) || points.length === 0) {
    return {
      reversalToPollenShedDays: null,
      pollinationToHarvestDays: null,
      totalCycleDays: null,
      hasCompleteData: false,
      missingEvents: [
        "reversal_application",
        "pollen_shed_observed",
        "pollination",
        "cross_harvest",
      ],
    };
  }

  const timed: TimedPoint[] = [];
  let hadInvalidTimestamp = false;

  for (const raw of points) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as BreedingCycleTimelinePoint;
    const time = typeof p.occurredAt === "string" ? parseTime(p.occurredAt) : null;
    if (time == null) {
      hadInvalidTimestamp = true;
      continue;
    }
    timed.push({ type: p.type, occurredAt: p.occurredAt, time });
  }

  if (hadInvalidTimestamp) missingEvents.add("invalid_timestamps");

  if (timed.length === 0) {
    missingEvents.add("reversal_application");
    missingEvents.add("pollen_shed_observed");
    missingEvents.add("pollination");
    missingEvents.add("cross_harvest");
    return {
      reversalToPollenShedDays: null,
      pollinationToHarvestDays: null,
      totalCycleDays: null,
      hasCompleteData: false,
      missingEvents: Array.from(missingEvents),
    };
  }

  timed.sort((a, b) => a.time - b.time);

  // isolation_start and stigmas_receptive are recognized breeding subtypes
  // (see breedingActionQueue.ts's SUPPORTED_BREEDING_EVENT_TYPES) but are
  // not part of either timed segment below. isolation_start is used only
  // as a totalCycleDays start fallback (feminized-seed cycles use
  // isolation instead of chemical reversal); stigmas_receptive has no
  // role in this calculator and is intentionally ignored, matching the
  // original draft's scope.
  const byType = (t: BreedingEventType) => timed.filter((p) => p.type === t);
  const reversals = byType("reversal_application");
  const isolations = byType("isolation_start");
  const pollenSheds = byType("pollen_shed_observed");
  const pollinations = byType("pollination");
  const harvests = byType("cross_harvest");

  // === reversal_application -> first pollen_shed_observed at/after it ===
  let reversalToPollenShedDays: number | null = null;
  let usedReversal: TimedPoint | null = null;

  if (reversals.length === 0) {
    missingEvents.add("reversal_application");
  } else {
    usedReversal = reversals[0];
    const after = earliestAtOrAfter(pollenSheds, usedReversal.time);
    if (after) {
      const d = daysBetween(usedReversal.occurredAt, after.occurredAt);
      if (d != null) {
        reversalToPollenShedDays = d;
      }
    } else {
      missingEvents.add("pollen_shed_observed");
    }
  }

  // === pollination -> first cross_harvest at/after it ===
  let pollinationToHarvestDays: number | null = null;
  let usedPollination: TimedPoint | null = null;
  let usedHarvest: TimedPoint | null = null;

  if (pollinations.length === 0) {
    missingEvents.add("pollination");
  } else {
    usedPollination = pollinations[0];
    const after = earliestAtOrAfter(harvests, usedPollination.time);
    if (after) {
      const d = daysBetween(usedPollination.occurredAt, after.occurredAt);
      if (d != null) {
        pollinationToHarvestDays = d;
        usedHarvest = after;
      }
    } else {
      missingEvents.add("cross_harvest");
    }
  }

  // === totalCycleDays: earliest known cycle-start marker -> the harvest above ===
  // usedReversal/usedPollination are already exactly reversals[0]/
  // pollinations[0] whenever non-null (or both null together), so no
  // separate array-index fallback is needed for them.
  const startForTotal = usedReversal ?? isolations[0] ?? usedPollination ?? null;
  const endForTotal = usedHarvest ?? harvests[0] ?? null;
  const totalCycleDays =
    startForTotal && endForTotal
      ? daysBetween(startForTotal.occurredAt, endForTotal.occurredAt)
      : null;

  const hasCompleteData = reversalToPollenShedDays !== null && pollinationToHarvestDays !== null;

  return {
    reversalToPollenShedDays,
    pollinationToHarvestDays,
    totalCycleDays,
    hasCompleteData,
    missingEvents: Array.from(missingEvents),
  };
}

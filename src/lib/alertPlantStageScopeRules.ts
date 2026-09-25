/**
 * alertPlantStageScopeRules — which plants' stages count toward one grow's
 * alert stage (QA 2026-09-24, BUG-006; Codex review on #1683).
 *
 * A plant belongs to the grow the canonical growAttributionRules resolve:
 * its own grow_id first, else its tent's grow. A legacy plant with
 * `grow_id = null` in one of the grow's tents therefore counts; a plant
 * whose own grow_id names another grow never does, whatever tent it sits in.
 *
 * `null` plants means the plant read has not settled and is passed through,
 * so persistence can wait for it. `undefined` means the caller supplied no
 * plant signal at all.
 *
 * Pure: no I/O, no React, no Supabase.
 */
import { buildTentGrowIndex, filterPlantsByResolvedGrow } from "@/lib/growAttributionRules";

export interface AlertStagePlant {
  readonly grow_id?: string | null;
  readonly tent_id?: string | null;
  readonly stage?: string | null;
}

export function resolveGrowPlantStages(
  plants: ReadonlyArray<AlertStagePlant> | null | undefined,
  growId: string,
  growTents: ReadonlyArray<{ readonly id: string }> | null | undefined,
): ReadonlyArray<string | null> | null | undefined {
  if (plants === undefined || plants === null) return plants;
  // growTents are this grow's tents, so each one rolls up to growId.
  const tentGrowById = buildTentGrowIndex((growTents ?? []).map((t) => ({ id: t.id, growId })));
  const attributable = plants.map((plant) => ({
    growId: plant.grow_id ?? null,
    tentId: plant.tent_id ?? null,
    stage: plant.stage ?? null,
  }));
  return filterPlantsByResolvedGrow(attributable, growId, tentGrowById).map((p) => p.stage);
}

/**
 * Pure helpers for resolving and repairing a plant's grow context.
 *
 * A plant should always carry `grow_id`. Legacy/older flows may have
 * created plants assigned to a tent but with `grow_id` left null. The
 * merge workflow (and any other grow-scoped action) needs an
 * "effective" grow id so it can:
 *
 *   - find safe, same-grow merge targets,
 *   - clearly explain when grow context is missing,
 *   - offer a one-click repair that updates ONLY `plants.grow_id`
 *     from the assigned tent.
 *
 * Cross-grow merges are NOT enabled here. This module never widens the
 * merge surface; it only derives grow context that already exists on
 * the assigned tent. The server-side RPC continues to reject cross-grow
 * merges regardless of what the UI computes.
 *
 * No React, no Supabase, no I/O. Safe to unit-test in isolation.
 */

export interface PlantGrowContextInput {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
}

export interface TentGrowLink {
  id: string;
  grow_id?: string | null;
}

/**
 * Returns the effective grow id for a plant:
 *   1. plant.grow_id when present,
 *   2. otherwise the grow_id of the assigned tent,
 *   3. otherwise null.
 *
 * Pure and deterministic. Does not mutate inputs.
 */
export function getEffectivePlantGrowId(
  plant: PlantGrowContextInput,
  tents: readonly TentGrowLink[] = [],
): string | null {
  if (plant.grow_id) return plant.grow_id;
  if (!plant.tent_id) return null;
  const tent = tents.find((t) => t.id === plant.tent_id);
  return tent?.grow_id ?? null;
}

export function canRepairPlantGrowContextFromTent(
  plant: PlantGrowContextInput,
  tents: readonly TentGrowLink[] = [],
): boolean {
  if (plant.grow_id) return false;
  if (!plant.tent_id) return false;
  const tent = tents.find((t) => t.id === plant.tent_id);
  return !!tent?.grow_id;
}

/**
 * Payload for the optional one-click repair. Touches ONLY `grow_id`.
 * Never touches logs, photos, sensor history, alerts, or Action Queue.
 */
export function buildPlantGrowContextRepairPayload(
  plant: PlantGrowContextInput,
  tents: readonly TentGrowLink[] = [],
): { grow_id: string } | null {
  if (!canRepairPlantGrowContextFromTent(plant, tents)) return null;
  const tent = tents.find((t) => t.id === plant.tent_id);
  if (!tent?.grow_id) return null;
  return { grow_id: tent.grow_id };
}

export interface PlantGrowContextMergeValidation {
  ok: boolean;
  reason?: string;
  sourceEffectiveGrowId: string | null;
  targetEffectiveGrowId: string | null;
}

/**
 * Validates that source + target share an *effective* grow id. Refuses
 * the merge when either side has no derivable grow context. Cross-grow
 * is always blocked — this helper never enables it.
 */
export function validatePlantGrowContextForMerge(
  source: PlantGrowContextInput,
  target: PlantGrowContextInput | null | undefined,
  tents: readonly TentGrowLink[] = [],
): PlantGrowContextMergeValidation {
  const s = getEffectivePlantGrowId(source, tents);
  if (!target) {
    return {
      ok: false,
      reason: "Pick a target plant to keep.",
      sourceEffectiveGrowId: s,
      targetEffectiveGrowId: null,
    };
  }
  const t = getEffectivePlantGrowId(target, tents);
  if (!s) {
    return {
      ok: false,
      reason:
        "This plant is missing grow context. Assign it to a tent in a grow before merging.",
      sourceEffectiveGrowId: s,
      targetEffectiveGrowId: t,
    };
  }
  if (!t) {
    return {
      ok: false,
      reason:
        "Target plant is missing grow context. Assign it to a tent in a grow before merging.",
      sourceEffectiveGrowId: s,
      targetEffectiveGrowId: t,
    };
  }
  if (s !== t) {
    return {
      ok: false,
      reason: "Plants must be in the same grow to merge.",
      sourceEffectiveGrowId: s,
      targetEffectiveGrowId: t,
    };
  }
  return {
    ok: true,
    sourceEffectiveGrowId: s,
    targetEffectiveGrowId: t,
  };
}

export function findPlantsMissingGrowContext<T extends PlantGrowContextInput>(
  plants: readonly T[],
): T[] {
  return plants.filter((p) => !p.grow_id);
}

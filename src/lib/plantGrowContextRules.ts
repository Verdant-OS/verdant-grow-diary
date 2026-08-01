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
 *     from the assigned tent, or from the grower's active grow when
 *     no tent-derived grow exists (Plant Detail rescue CTA).
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
  name?: string | null;
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

/**
 * One-click assign when the plant has no grow_id and no tent-derived grow,
 * but the grower has an active setup. Still updates ONLY `plants.grow_id`.
 */
export function canAssignPlantToActiveGrow(
  plant: PlantGrowContextInput,
  activeGrowId: string | null | undefined,
  tents: readonly TentGrowLink[] = [],
): boolean {
  if (plant.grow_id) return false;
  if (!activeGrowId) return false;
  // Prefer tent-derived repair when available — do not overwrite that path.
  if (canRepairPlantGrowContextFromTent(plant, tents)) return false;
  return true;
}

export function buildPlantAssignToActiveGrowPayload(
  plant: PlantGrowContextInput,
  activeGrowId: string | null | undefined,
  tents: readonly TentGrowLink[] = [],
): { grow_id: string } | null {
  if (!canAssignPlantToActiveGrow(plant, activeGrowId, tents)) return null;
  return { grow_id: activeGrowId as string };
}

export type PlantGrowRescueKind =
  | "already_ok"
  | "repair_from_tent"
  | "assign_active_grow"
  | "needs_grow";

export interface PlantGrowRescueView {
  kind: PlantGrowRescueKind;
  /** When non-null, one-click write uses this payload (ONLY grow_id). */
  payload: { grow_id: string } | null;
  title: string;
  description: string;
  ctaLabel: string | null;
  /** Optional secondary link for empty-grow accounts. */
  secondaryHref: string | null;
  secondaryLabel: string | null;
  /** Human label for the grow being assigned (active name or tent's grow). */
  targetGrowLabel: string | null;
}

/**
 * Deterministic Plant Detail rescue view-model.
 * Prefer tent-derived repair over active-grow assign so lineage stays coherent.
 */
export function resolvePlantGrowRescue(input: {
  plant: PlantGrowContextInput;
  tents?: readonly TentGrowLink[];
  activeGrowId?: string | null;
  activeGrowName?: string | null;
  tentGrowName?: string | null;
}): PlantGrowRescueView {
  const tents = input.tents ?? [];
  const plant = input.plant;

  if (plant.grow_id) {
    return {
      kind: "already_ok",
      payload: null,
      title: "Grow context ready",
      description: "This plant is linked to a grow.",
      ctaLabel: null,
      secondaryHref: null,
      secondaryLabel: null,
      targetGrowLabel: null,
    };
  }

  if (canRepairPlantGrowContextFromTent(plant, tents)) {
    const payload = buildPlantGrowContextRepairPayload(plant, tents)!;
    const tent = tents.find((t) => t.id === plant.tent_id);
    const label = input.tentGrowName?.trim() || null;
    return {
      kind: "repair_from_tent",
      payload,
      title: "Missing grow link",
      description:
        "This plant sits in a tent that already belongs to a grow, but the plant row never got grow_id. One click copies the tent's grow onto the plant so Quick Log and Action Queue work.",
      ctaLabel: label ? `Link to tent's grow (${label})` : "Link to tent's grow",
      secondaryHref: "/grow-lineage",
      secondaryLabel: "Open Lineage Repair",
      targetGrowLabel: label,
    };
  }

  if (canAssignPlantToActiveGrow(plant, input.activeGrowId, tents)) {
    const payload = buildPlantAssignToActiveGrowPayload(plant, input.activeGrowId, tents)!;
    const label = input.activeGrowName?.trim() || null;
    return {
      kind: "assign_active_grow",
      payload,
      title: "Assign this plant to a grow",
      description:
        "Quick Log, alerts, and Action Queue need grow context. Assign this plant to your active setup so you can log without visiting Lineage Repair.",
      ctaLabel: label ? `Assign to active grow (${label})` : "Assign to active grow",
      secondaryHref: "/grows",
      secondaryLabel: "Choose a different grow",
      targetGrowLabel: label,
    };
  }

  return {
    kind: "needs_grow",
    payload: null,
    title: "Assign this plant to a grow",
    description:
      "Create or activate a grow first, then return here to link this plant. Until then Quick Log cannot save grower memory for this plant.",
    ctaLabel: null,
    secondaryHref: "/grows",
    secondaryLabel: "Go to My Grows",
    targetGrowLabel: null,
  };
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
      reason: "This plant is missing grow context. Assign it to a tent in a grow before merging.",
      sourceEffectiveGrowId: s,
      targetEffectiveGrowId: t,
    };
  }
  if (!t) {
    return {
      ok: false,
      reason: "Target plant is missing grow context. Assign it to a tent in a grow before merging.",
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

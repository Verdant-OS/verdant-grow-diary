/** Presentation for other-grow destinations; existing move/untag rules own writes. */
export interface PlantMoveDestinationTent {
  id: string;
  name: string;
  grow_id?: string | null;
  grow_name?: string | null;
  is_archived?: boolean | null;
}

export interface PlantMoveDestinationContext {
  growId: string | null | undefined;
  currentTentId: string | null | undefined;
  huntStatus: "linked" | "clear" | "unresolved";
}

export interface PlantMoveDestination {
  id: string;
  label: string;
  disabled: boolean;
  reason: string | null;
}

/** A tent disclosed in the other-grow group must not also have an enabled alias. */
export function withoutDisclosedMoveDestinations<T extends { id: string }>(
  tents: readonly T[],
  destinations: readonly PlantMoveDestination[],
): T[] {
  const disclosedIds = new Set(destinations.map((destination) => destination.id));
  return tents.filter((tent) => !disclosedIds.has(tent.id));
}

export function buildOtherGrowMoveDestinations(
  tents: readonly PlantMoveDestinationTent[] | null | undefined,
  plant: PlantMoveDestinationContext | null | undefined,
): PlantMoveDestination[] {
  if (!plant) return [];
  const plantGrowId = plant.growId?.trim() || null;
  const reason =
    plant.huntStatus === "linked"
      ? "Untag from the Pheno Hunt first to move to this grow."
      : plant.huntStatus === "unresolved"
        ? "Pheno Hunt status is unavailable. Read it before moving to another grow."
        : null;
  return (tents ?? [])
    .filter(
      (tent) =>
        !tent.is_archived &&
        tent.id !== plant.currentTentId &&
        Boolean(tent.grow_id?.trim()) &&
        tent.grow_id?.trim() !== plantGrowId,
    )
    .map((tent) => ({
      id: tent.id,
      label: `${tent.name.trim() || "Unnamed tent"} — ${tent.grow_name?.trim() || "Grow name unavailable"}`,
      disabled: reason !== null,
      reason,
    }));
}

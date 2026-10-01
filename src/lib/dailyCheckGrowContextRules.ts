export interface DailyCheckGrowContextInput {
  plant?: { grow_id?: string | null; tent_id?: string | null } | null;
  assignedTent?: { id: string; grow_id?: string | null } | null;
  urlGrowId?: string | null;
  activeGrowId?: string | null;
}

/**
 * Keep a plant's known grow authoritative. A legacy plant may recover its
 * grow from its matching, available assigned tent before workspace fallback.
 * The caller retains its existing route-scope and tent-compatibility guards;
 * this helper neither changes the selection nor establishes authorization.
 */
export function resolveDailyCheckGrowContext(
  input: DailyCheckGrowContextInput | null | undefined,
): string | null {
  const plantGrowId = input?.plant?.grow_id;
  if (plantGrowId != null) return plantGrowId;

  const assignedTent = input?.assignedTent;
  if (input?.plant?.tent_id && assignedTent?.id === input.plant.tent_id && assignedTent.grow_id) {
    return assignedTent.grow_id;
  }

  return input?.urlGrowId ?? input?.activeGrowId ?? null;
}

/**
 * quickLogPhenoEvidenceHandoffRules — pure resolution for Pheno evidence-goal
 * handoffs into the existing Quick Log dialog.
 *
 * The handoff payload carries phenoHuntId + phenoEvidenceGoal because the
 * grower clicked "Record <goal> evidence". The dialog must seed that goal
 * without requiring plants.pheno_hunt_id to already be present on the loaded
 * plant row (candidates can be untented; plant queries may omit the column).
 *
 * Never invents a hunt or goal. Never picks a different goal than the one
 * the grower clicked.
 *
 * Pure. No I/O, no React, no time.
 */

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

export interface ResolveQuickLogPhenoHuntIdInput {
  /** plants.pheno_hunt_id when present on the selected plant row. */
  plantHuntId?: string | null;
  /** Prefill hunt from a "Record <goal> evidence" handoff. */
  prefillHuntId?: string | null;
  /** Prefill plant id (must match selected plant to accept prefill hunt). */
  prefillPlantId?: string | null;
  /** Currently selected plant in the dialog. */
  selectedPlantId?: string | null;
}

/**
 * Resolve which hunt id drives the Pheno evidence panel + goal seed.
 *
 * Priority:
 *  1. Prefill hunt when the selected plant is the handoff plant
 *  2. Plant row pheno_hunt_id
 *  3. null (panel stays closed / seed stays empty)
 */
export function resolveQuickLogPhenoHuntId(
  input: ResolveQuickLogPhenoHuntIdInput,
): string | null {
  const selectedPlantId = cleanId(input.selectedPlantId);
  const prefillPlantId = cleanId(input.prefillPlantId);
  const prefillHuntId = cleanId(input.prefillHuntId);
  const plantHuntId = cleanId(input.plantHuntId);

  if (
    prefillHuntId &&
    selectedPlantId &&
    prefillPlantId &&
    selectedPlantId === prefillPlantId
  ) {
    return prefillHuntId;
  }

  return plantHuntId;
}

export interface ResolveQuickLogPhenoGoalSeedInput {
  open: boolean;
  alreadyConsumed: boolean;
  prefillGoalId?: string | null;
  prefillHuntId?: string | null;
  prefillPlantId?: string | null;
  selectedPlantId?: string | null;
  resolvedHuntId?: string | null;
  /** Configured goal ids from ready capture context. */
  configuredGoalIds?: readonly string[] | null;
  contextStatus?: string | null;
  contextHuntId?: string | null;
}

export type ResolveQuickLogPhenoGoalSeedResult =
  | { action: "none" }
  | { action: "seed"; goalId: string }
  | { action: "consume_only" };

/**
 * Decide whether to seed the evidence-goal chip from a handoff.
 * Returns `seed` only when plant, hunt, context, and goal all agree.
 */
export function resolveQuickLogPhenoGoalSeed(
  input: ResolveQuickLogPhenoGoalSeedInput,
): ResolveQuickLogPhenoGoalSeedResult {
  if (!input.open || input.alreadyConsumed) return { action: "none" };

  const goalId = cleanId(input.prefillGoalId);
  if (!goalId) return { action: "none" };

  const prefillPlantId = cleanId(input.prefillPlantId);
  const selectedPlantId = cleanId(input.selectedPlantId);
  if (!prefillPlantId || !selectedPlantId || prefillPlantId !== selectedPlantId) {
    return { action: "none" };
  }

  const prefillHuntId = cleanId(input.prefillHuntId);
  const resolvedHuntId = cleanId(input.resolvedHuntId);
  if (!prefillHuntId || !resolvedHuntId || prefillHuntId !== resolvedHuntId) {
    return { action: "none" };
  }

  if (input.contextStatus !== "ready") return { action: "none" };
  const contextHuntId = cleanId(input.contextHuntId);
  if (!contextHuntId || contextHuntId !== prefillHuntId) return { action: "none" };

  const configured = Array.isArray(input.configuredGoalIds) ? input.configuredGoalIds : [];
  if (!configured.some((g) => cleanId(g) === goalId)) return { action: "none" };

  return { action: "seed", goalId };
}

/**
 * phenoHuntCandidateQueryRules — pure PostgREST filter builders for Pheno Hunt
 * "new hunt" candidate plant lists.
 *
 * A plant is a candidate for a grow when:
 *   - plant.grow_id matches the grow, OR
 *   - plant.tent_id is one of the grow's tents (orphan-attributed via tent).
 *
 * When the hunt is also tent-scoped (?tentId=):
 *   - plants currently in that tent, OR
 *   - plants already bound to the grow with no tent yet (grow-level plants
 *     from Start your room / rescue that haven't been assigned a tent).
 *
 * Pure: no I/O. Used by PhenoHuntNew (and tests).
 */
import { buildGrowScopedPlantsOrFilter } from "@/lib/growAttributionRules";

export interface PhenoHuntCandidateQueryInput {
  growId: string;
  /** Tent ids that already belong to the grow (from tents.grow_id = growId). */
  tentIdsInGrow: ReadonlyArray<string> | null | undefined;
  /** Optional URL tent scope. */
  tentScopeId?: string | null;
}

function cleanId(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Build the `.or(...)` filter string for plants eligible as candidates.
 * Returns null when growId is missing (caller should not query).
 */
export function buildPhenoHuntCandidateOrFilter(
  input: PhenoHuntCandidateQueryInput,
): string | null {
  const growId = cleanId(input.growId);
  if (!growId) return null;

  const tentScope = cleanId(input.tentScopeId ?? null);
  if (tentScope) {
    // tent_id = scope OR (grow_id = grow AND tent_id is null)
    // PostgREST nested and(): and(grow_id.eq.G,tent_id.is.null)
    return `tent_id.eq.${tentScope},and(grow_id.eq.${growId},tent_id.is.null)`;
  }

  return buildGrowScopedPlantsOrFilter(growId, input.tentIdsInGrow);
}

/** Human copy for empty candidate lists — keeps page and tests aligned. */
export const PHENO_HUNT_EMPTY_CANDIDATES = {
  title: "No candidate plants for this grow yet",
  body: "Add a plant bound to this grow (or to one of its tents). Plants need grow context so Quick Log and Pheno Hunt can use them.",
  ctaPlants: "Add a plant",
  ctaStartRoom: "Start your room",
  ctaLineage: "Repair grow links",
} as const;

/**
 * Client-side membership check mirroring the dual-binding rules.
 * Useful for tests and defensive client filtering after a query.
 */
export function plantMatchesPhenoHuntCandidate(input: {
  plantGrowId: string | null | undefined;
  plantTentId: string | null | undefined;
  growId: string;
  tentIdsInGrow: ReadonlyArray<string>;
  tentScopeId?: string | null;
}): boolean {
  const growId = cleanId(input.growId);
  if (!growId) return false;
  const pGrow = cleanId(input.plantGrowId ?? null);
  const pTent = cleanId(input.plantTentId ?? null);
  const tentScope = cleanId(input.tentScopeId ?? null);
  const tentSet = new Set(
    (input.tentIdsInGrow ?? []).map((t) => cleanId(t)).filter((t): t is string => !!t),
  );

  if (tentScope) {
    if (pTent === tentScope) return true;
    if (pGrow === growId && pTent === null) return true;
    return false;
  }

  if (pGrow === growId) return true;
  if (pTent && tentSet.has(pTent)) return true;
  return false;
}

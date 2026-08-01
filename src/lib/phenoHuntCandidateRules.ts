/**
 * phenoHuntCandidateRules — pure eligibility for Pheno Hunt plant candidates.
 *
 * A plant is in a grow when:
 *   A) plant.grow_id === growId, or
 *   B) plant.tent_id points at a tent whose grow_id === growId
 *
 * Historical rows often had only (B) (plant.grow_id null after tent moves).
 * New creates set both. Candidate lists must accept either so hunts are not
 * empty after a correct room setup.
 *
 * Pure: no React, no Supabase, no side effects.
 */

export type PhenoCandidateBinding = "grow_id" | "tent_grow" | "both";

export interface PhenoCandidatePlantRow {
  id: string;
  name: string;
  strain?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  is_archived?: boolean | null;
}

export interface PhenoCandidateOption {
  id: string;
  name: string;
  strain: string | null;
  tentId: string | null;
  growId: string | null;
  /** How this plant qualifies for the grow. */
  binding: PhenoCandidateBinding;
  /** True when grow_id is missing but tent is linked — soft lineage gap. */
  missingDirectGrowId: boolean;
}

export function plantEligibleForGrow(input: {
  plantGrowId: string | null | undefined;
  plantTentId: string | null | undefined;
  growId: string;
  tentIdsInGrow: ReadonlySet<string> | readonly string[];
}): boolean {
  const growId = input.growId.trim();
  if (!growId) return false;
  if (input.plantGrowId && input.plantGrowId === growId) return true;
  const tentId = input.plantTentId ?? null;
  if (!tentId) return false;
  const set =
    input.tentIdsInGrow instanceof Set ? input.tentIdsInGrow : new Set(input.tentIdsInGrow);
  return set.has(tentId);
}

export function resolvePhenoCandidateBinding(input: {
  plantGrowId: string | null | undefined;
  plantTentId: string | null | undefined;
  growId: string;
  tentIdsInGrow: ReadonlySet<string> | readonly string[];
}): PhenoCandidateBinding | null {
  const growId = input.growId.trim();
  if (!growId) return null;
  const viaGrow = !!input.plantGrowId && input.plantGrowId === growId;
  const tentId = input.plantTentId ?? null;
  const set =
    input.tentIdsInGrow instanceof Set ? input.tentIdsInGrow : new Set(input.tentIdsInGrow);
  const viaTent = !!tentId && set.has(tentId);
  if (viaGrow && viaTent) return "both";
  if (viaGrow) return "grow_id";
  if (viaTent) return "tent_grow";
  return null;
}

/**
 * Merge plant rows from grow_id query + tent-membership query, dedupe by id,
 * optional tent filter, exclude archived.
 */
export function buildPhenoHuntCandidateOptions(input: {
  growId: string;
  tentIdsInGrow: readonly string[];
  plants: readonly PhenoCandidatePlantRow[];
  /** When set, only plants in this tent. */
  filterTentId?: string | null;
}): PhenoCandidateOption[] {
  const growId = input.growId.trim();
  if (!growId) return [];
  const tentSet = new Set(input.tentIdsInGrow.filter(Boolean));
  const filterTent = input.filterTentId?.trim() || null;
  const byId = new Map<string, PhenoCandidateOption>();

  for (const p of input.plants) {
    if (!p?.id) continue;
    if (p.is_archived) continue;
    if (filterTent && (p.tent_id ?? null) !== filterTent) continue;

    const binding = resolvePhenoCandidateBinding({
      plantGrowId: p.grow_id ?? null,
      plantTentId: p.tent_id ?? null,
      growId,
      tentIdsInGrow: tentSet,
    });
    if (!binding) continue;

    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Unnamed plant";
    byId.set(p.id, {
      id: p.id,
      name,
      strain: p.strain ?? null,
      tentId: p.tent_id ?? null,
      growId: p.grow_id ?? null,
      binding,
      missingDirectGrowId: !(p.grow_id && p.grow_id === growId),
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function phenoHuntEmptyCopy(input: {
  candidateCount: number;
  filterTentId?: string | null;
  growPlantCountIgnoringTent?: number;
}): {
  isEmpty: boolean;
  headline: string;
  body: string;
  ctaLabel: string;
} {
  if (input.candidateCount > 0) {
    return {
      isEmpty: false,
      headline: "",
      body: "",
      ctaLabel: "",
    };
  }
  if (input.filterTentId && (input.growPlantCountIgnoringTent ?? 0) > 0) {
    return {
      isEmpty: true,
      headline: "No plants in this tent",
      body: "This grow has plants, but none are assigned to this tent yet. Add a plant to the tent, or start the hunt from the grow without a tent filter.",
      ctaLabel: "Go to grow to add a plant",
    };
  }
  return {
    isEmpty: true,
    headline: "No plants in this grow yet",
    body: "Add a plant bound to this grow (or to a tent in this grow) before starting a Pheno Hunt. Candidates are tagged plants, not separate records.",
    ctaLabel: "Go to grow to add a plant",
  };
}

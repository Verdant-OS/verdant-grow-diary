/**
 * phenoHuntCandidateLoader — fetch grow + tent-linked plants for Pheno Hunt.
 *
 * Loads:
 *   1. tents for the grow (ids)
 *   2. plants with grow_id = growId
 *   3. plants with tent_id in those tents (catches null plant.grow_id)
 *
 * Merges via pure rules. RLS-scoped; never service_role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import {
  buildPhenoHuntCandidateOptions,
  type PhenoCandidateOption,
  type PhenoCandidatePlantRow,
} from "@/lib/phenoHuntCandidateRules";

export interface LoadPhenoHuntCandidatesInput {
  growId: string;
  tentId?: string | null;
}

export interface LoadPhenoHuntCandidatesResult {
  grow: { id: string; name: string } | null;
  tentIdsInGrow: string[];
  candidates: PhenoCandidateOption[];
  /** Count eligible for grow before tent filter (for empty-state copy). */
  growScopeCandidateCount: number;
  error: string | null;
}

export async function loadPhenoHuntCandidates(
  input: LoadPhenoHuntCandidatesInput,
  client: SupabaseClient = defaultClient,
): Promise<LoadPhenoHuntCandidatesResult> {
  const growId = input.growId?.trim();
  if (!growId) {
    return {
      grow: null,
      tentIdsInGrow: [],
      candidates: [],
      growScopeCandidateCount: 0,
      error: "Grow is required.",
    };
  }

  const growRes = await client.from("grows").select("id,name").eq("id", growId).maybeSingle();

  if (growRes.error) {
    return {
      grow: null,
      tentIdsInGrow: [],
      candidates: [],
      growScopeCandidateCount: 0,
      error: growRes.error.message,
    };
  }

  const grow = growRes.data
    ? { id: (growRes.data as { id: string }).id, name: (growRes.data as { name: string }).name }
    : null;

  const tentsRes = await client
    .from("tents")
    .select("id")
    .eq("grow_id", growId)
    .eq("is_archived", false);

  if (tentsRes.error) {
    return {
      grow,
      tentIdsInGrow: [],
      candidates: [],
      growScopeCandidateCount: 0,
      error: tentsRes.error.message,
    };
  }

  const tentIdsInGrow = (tentsRes.data ?? []).map((t) => (t as { id: string }).id);

  // Direct grow_id binding
  const byGrowRes = await client
    .from("plants")
    .select("id,name,strain,grow_id,tent_id,is_archived")
    .eq("grow_id", growId)
    .eq("is_archived", false);

  if (byGrowRes.error) {
    return {
      grow,
      tentIdsInGrow,
      candidates: [],
      growScopeCandidateCount: 0,
      error: byGrowRes.error.message,
    };
  }

  // Tent-membership binding (plants that may still have null grow_id)
  let byTentRows: PhenoCandidatePlantRow[] = [];
  if (tentIdsInGrow.length > 0) {
    const byTentRes = await client
      .from("plants")
      .select("id,name,strain,grow_id,tent_id,is_archived")
      .in("tent_id", tentIdsInGrow)
      .eq("is_archived", false);
    if (byTentRes.error) {
      return {
        grow,
        tentIdsInGrow,
        candidates: [],
        growScopeCandidateCount: 0,
        error: byTentRes.error.message,
      };
    }
    byTentRows = (byTentRes.data ?? []) as PhenoCandidatePlantRow[];
  }

  const merged: PhenoCandidatePlantRow[] = [
    ...((byGrowRes.data ?? []) as PhenoCandidatePlantRow[]),
    ...byTentRows,
  ];

  const growScope = buildPhenoHuntCandidateOptions({
    growId,
    tentIdsInGrow,
    plants: merged,
    filterTentId: null,
  });

  const candidates = buildPhenoHuntCandidateOptions({
    growId,
    tentIdsInGrow,
    plants: merged,
    filterTentId: input.tentId ?? null,
  });

  return {
    grow,
    tentIdsInGrow,
    candidates,
    growScopeCandidateCount: growScope.length,
    error: null,
  };
}

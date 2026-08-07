/**
 * phenoGrowOutPlantsService — bounded, RLS-scoped reads backing the keeper →
 * next-grow handoff.
 *
 * Two reads, both SELECT-only:
 *  1. `listLinkablePlantsForOwner` — the grower's own non-archived plants, so
 *     they can say "this clone was grown as THAT plant". RLS scopes to the
 *     owner; bounded because plants accumulate across seasons.
 *  2. `loadGrowOutPlantDetails` — for plants already linked to a clone, the
 *     plant's label/grow plus any traits the grower recorded on it. Trait
 *     evidence is read through the CROSS-HUNT-safe candidate-score reader:
 *     a grow-out lives in a LATER hunt than the keeper it descends from, so
 *     a hunt-scoped read would find nothing.
 *
 * No writes, no service_role, no automation. Best-effort: any failure yields
 * an empty map so the handoff simply offers nothing rather than breaking the
 * keepers page.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { listCandidateScoresForPlants } from "@/lib/phenoCandidateScoresService";
import type { GrowOutPlantInput } from "@/lib/phenoGrowOutHandoffRules";

/** A plant the grower can pick when linking a clone to its grow-out. */
export interface LinkablePlantRow {
  readonly plantId: string;
  readonly plantName: string;
  readonly strain: string | null;
  readonly growId: string | null;
  readonly phenoHuntId: string | null;
}

const MAX_LINKABLE_PLANTS = 500;
const MAX_GROW_OUT_PLANTS = 200;

/**
 * The grower's own non-archived plants, newest-relevant first by name for a
 * stable picker. RLS scopes to the owner — no client-supplied user filter.
 */
export async function listLinkablePlantsForOwner(): Promise<LinkablePlantRow[]> {
  const { data, error } = await phenoDb
    .from("plants")
    .select("id, name, strain, grow_id, pheno_hunt_id, is_archived")
    .eq("is_archived", false)
    .order("name", { ascending: true })
    .limit(MAX_LINKABLE_PLANTS);
  if (error || !data) return [];
  return data
    .filter((r) => typeof r.id === "string" && r.id !== "")
    .map((r) => ({
      plantId: r.id,
      plantName: typeof r.name === "string" && r.name.trim() !== "" ? r.name : "Unnamed plant",
      strain: typeof r.strain === "string" && r.strain.trim() !== "" ? r.strain : null,
      growId: typeof r.grow_id === "string" ? r.grow_id : null,
      phenoHuntId: typeof r.pheno_hunt_id === "string" ? r.pheno_hunt_id : null,
    }));
}

/**
 * Details (label, grow name, recorded traits) for plants linked to clones,
 * keyed by plant id. Traits come only from what the grower recorded on that
 * plant; a plant outside any hunt simply has none.
 */
export async function loadGrowOutPlantDetails(
  plantIds: readonly string[],
): Promise<Record<string, GrowOutPlantInput>> {
  const ids = [
    ...new Set((plantIds ?? []).filter((v): v is string => typeof v === "string" && v !== "")),
  ].slice(0, MAX_GROW_OUT_PLANTS);
  if (ids.length === 0) return {};

  const { data, error } = await phenoDb
    .from("plants")
    .select("id, name, grow_id, pheno_hunt_id")
    .in("id", ids)
    .limit(MAX_GROW_OUT_PLANTS);
  if (error || !data) return {};

  // Grow names, best-effort — a missing grow just leaves the label bare.
  const growIds = [
    ...new Set(
      data.map((r) => (typeof r.grow_id === "string" ? r.grow_id : "")).filter((v) => v !== ""),
    ),
  ];
  const growNameById: Record<string, string> = {};
  if (growIds.length > 0) {
    // `grows` is deliberately absent from the narrow pheno type boundary, so
    // this name lookup goes through the default client (same shape as
    // phenoHuntCandidatesService.loadNameMap). SELECT only.
    const { data: grows } = await supabase
      .from("grows")
      .select("id, name")
      .in("id", growIds)
      .limit(MAX_GROW_OUT_PLANTS);
    for (const g of (grows ?? []) as Array<{ id: string; name: string | null }>) {
      if (g.id && typeof g.name === "string") growNameById[g.id] = g.name;
    }
  }

  // Recorded traits — CROSS-HUNT safe: each plant is paired with its OWN
  // hunt, because a grow-out belongs to a later hunt than its keeper.
  const scoreRefs = data
    .filter((r) => typeof r.pheno_hunt_id === "string" && r.pheno_hunt_id !== "")
    .map((r) => ({ plantId: r.id as string, huntId: r.pheno_hunt_id as string }));
  let traitsByPlant: Record<string, { traits: Record<string, number> }> = {};
  if (scoreRefs.length > 0) {
    try {
      traitsByPlant = (await listCandidateScoresForPlants(scoreRefs)) as Record<
        string,
        { traits: Record<string, number> }
      >;
    } catch {
      traitsByPlant = {}; // best-effort: no evidence rather than a broken page
    }
  }

  const out: Record<string, GrowOutPlantInput> = {};
  for (const r of data) {
    if (typeof r.id !== "string" || r.id === "") continue;
    const growId = typeof r.grow_id === "string" ? r.grow_id : "";
    const scored = traitsByPlant[r.id];
    out[r.id] = {
      plantId: r.id,
      plantName: typeof r.name === "string" && r.name.trim() !== "" ? r.name : null,
      growName: growId !== "" ? (growNameById[growId] ?? null) : null,
      traits: scored && scored.traits && typeof scored.traits === "object" ? scored.traits : null,
    };
  }
  return out;
}

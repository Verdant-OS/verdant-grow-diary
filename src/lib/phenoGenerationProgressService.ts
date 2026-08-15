/**
 * phenoGenerationProgressService — bounded, RLS-scoped reads backing the
 * cross-generation objective progress view.
 *
 * Walks a hunt's `parent_hunt_id` chain (owner-scoped by RLS, so an unowned
 * parent simply does not resolve and the walk stops there), then loads each
 * generation's breeding objective and its candidates' recorded traits.
 *
 * The walk is bounded twice over: MAX_GENERATION_CHAIN caps how far back it
 * follows, and a visited set breaks any ring the database cannot reject.
 * SELECT-only; best-effort, returning an empty chain rather than throwing.
 */
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { supabase } from "@/integrations/supabase/client";
import { listCandidateScoresForHunt } from "@/lib/phenoCandidateScoresService";
import { sanitizeBreedingObjectiveTargets } from "@/lib/phenoBreedingObjectiveRules";
import {
  MAX_GENERATION_CHAIN,
  type GenerationHuntInput,
} from "@/lib/phenoObjectiveGenerationRules";

/**
 * Hard ceiling per generation. Not a sampling cap — the loader paginates up to
 * this and REFUSES rather than reporting a truncated cohort as a whole one.
 */
const MAX_CANDIDATES_PER_GENERATION = 2000;
const CANDIDATE_PAGE_SIZE = 500;

interface RawHuntRow {
  id: string;
  name: string | null;
  generation: string | null;
  parent_hunt_id: string | null;
  breeding_objective: unknown;
}

/** One hunt row, owner-scoped by RLS. Returns null when not readable. */
async function readHunt(huntId: string): Promise<RawHuntRow | null> {
  const { data, error } = await supabase
    .from("pheno_hunts")
    // "*" so a deploy window where the parent-hunt migration has not landed
    // yet still resolves the row; the missing column arrives as undefined.
    .select("*")
    .eq("id", huntId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    name: typeof row.name === "string" ? row.name : null,
    generation: typeof row.generation === "string" ? row.generation : null,
    parent_hunt_id: typeof row.parent_hunt_id === "string" ? row.parent_hunt_id : null,
    breeding_objective: row.breeding_objective,
  };
}

/**
 * Every candidate plant id for a hunt.
 *
 * Paginated deliberately: the share that met the bar is presented as the
 * generation's WHOLE cohort, so a silently sampled subset would misreport it —
 * omitting unscored candidates inflates the percentage, and an unordered
 * sample makes repeated reads disagree with each other.
 *
 * Throws on read failure and on exceeding the safety ceiling. A caller must
 * never receive a short list it cannot distinguish from a small hunt: unknown
 * is not the same as empty, and the hook hides the model rather than reporting
 * a cohort it could not actually count.
 */
async function candidatePlantIds(huntId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; from < MAX_CANDIDATES_PER_GENERATION; from += CANDIDATE_PAGE_SIZE) {
    const to = Math.min(from + CANDIDATE_PAGE_SIZE, MAX_CANDIDATES_PER_GENERATION) - 1;
    const { data, error } = await phenoDb
      .from("plants")
      .select("id")
      .eq("pheno_hunt_id", huntId)
      .eq("is_archived", false)
      .order("id", { ascending: true })
      .range(from, to);
    if (error || !data) {
      throw new Error(`pheno generation: candidate read failed for hunt ${huntId}`);
    }
    for (const row of data) {
      if (typeof row.id === "string" && row.id !== "") ids.push(row.id);
    }
    if (data.length < to - from + 1) return ids; // exhausted
  }
  throw new Error(
    `pheno generation: hunt ${huntId} exceeds ${MAX_CANDIDATES_PER_GENERATION} candidates; ` +
      "refusing to present a truncated cohort as a complete share",
  );
}

/**
 * Load the generation chain ending at `leafHuntId`, keyed by hunt id and
 * ready for buildGenerationChain / buildGenerationProgress.
 *
 * Each generation carries its OWN objective targets and its candidates' own
 * recorded traits — nothing is inherited or back-filled between generations,
 * so a hunt that never set targets simply contributes no comparable axes.
 */
export async function loadGenerationChain(
  leafHuntId: string,
): Promise<Record<string, GenerationHuntInput>> {
  const leaf = typeof leafHuntId === "string" ? leafHuntId.trim() : "";
  if (leaf === "") return {};

  const out: Record<string, GenerationHuntInput> = {};
  const visited = new Set<string>();
  let currentId: string | null = leaf;

  while (currentId && visited.size < MAX_GENERATION_CHAIN) {
    if (visited.has(currentId)) break; // ring — stop rather than spin
    visited.add(currentId);

    const row = await readHunt(currentId);
    if (!row) break; // unreadable / not owned → the chain ends here

    const plantIds = await candidatePlantIds(row.id);
    let traitsByPlant: Record<string, { traits: Record<string, number> }> = {};
    if (plantIds.length > 0) {
      // Deliberately NOT caught. A failed score read is unknown evidence, and
      // swallowing it here would render every candidate as "not yet scored" —
      // a factual claim the data does not support, which then feeds a trend.
      // Let it propagate so the hook hides the model instead.
      traitsByPlant = (await listCandidateScoresForHunt(row.id, plantIds)) as Record<
        string,
        { traits: Record<string, number> }
      >;
    }

    out[row.id] = {
      huntId: row.id,
      huntName: row.name ?? "Untitled hunt",
      generationLabel: row.generation,
      parentHuntId: row.parent_hunt_id,
      targets: sanitizeBreedingObjectiveTargets(
        Array.isArray(row.breeding_objective) ? (row.breeding_objective as unknown[]) : null,
      ),
      // Every candidate contributes a row, scored or not — an unscored plant
      // must read as "not yet scored", never be silently dropped from the
      // cohort (which would inflate the share that met the bar).
      candidates: plantIds.map((pid) => ({
        traits: traitsByPlant[pid]?.traits ?? null,
      })),
    };

    currentId = row.parent_hunt_id;
  }

  return out;
}

/** Point a hunt at the earlier hunt it continues from (or clear it with null). */
export async function setParentHunt(input: {
  huntId: string;
  parentHuntId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const huntId = typeof input.huntId === "string" ? input.huntId.trim() : "";
  if (huntId === "") return { ok: false, error: "Missing hunt id." };
  const parentRaw = typeof input.parentHuntId === "string" ? input.parentHuntId.trim() : "";
  const parentHuntId = parentRaw === "" ? null : parentRaw;
  if (parentHuntId === huntId) {
    return { ok: false, error: "A hunt cannot continue from itself." };
  }
  const { data, error } = await supabase
    .from("pheno_hunts")
    .update({ parent_hunt_id: parentHuntId } as never)
    .eq("id", huntId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That hunt link was not saved." };
  return { ok: true };
}

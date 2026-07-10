/**
 * phenoHuntCandidatesService — read-only loader for a real pheno hunt's
 * candidates.
 *
 * Reads `pheno_hunts` + its candidate `plants` (RLS-scoped to the signed-in
 * grower; the server enforces ownership) and maps them into the pure
 * comparison view-model input via phenoHuntCandidateAdapter. No writes, no
 * service_role, no automation. SELECT only.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  adaptPhenoHuntCandidates,
  type PhenoHuntCandidateLabEvidence,
  type PhenoHuntCandidatePlantRow,
  type PhenoHuntCandidateScoreEvidence,
  type PhenoHuntCandidateSmokeEvidence,
} from "@/lib/phenoHuntCandidateAdapter";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";


export interface PhenoHuntSummary {
  id: string;
  name: string;
  growId: string | null;
  tentId: string | null;
  /** Selected evidence goal ids persisted at onboarding. Optional so older
   * test stubs and callers stay compatible. */
  evidenceGoals?: string[];
  notes?: string | null;
  setupCompletedAt?: string | null;
}

export type LoadPhenoHuntCandidatesResult =
  | { ok: true; hunt: PhenoHuntSummary; candidates: PhenoCandidateInput[] }
  | { ok: false; error: string };

/** Load a hunt and its (non-archived) candidate plants, mapped for comparison. */
export async function loadPhenoHuntCandidates(
  huntId: string,
): Promise<LoadPhenoHuntCandidatesResult> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return { ok: false, error: "Missing hunt id." };

  const { data: huntRow, error: huntError } = await supabase
    .from("pheno_hunts")
    // "*" (not an explicit column list) so the workspace keeps loading
    // during a deploy window where the guided-setup migration has not been
    // applied yet — missing columns simply arrive as undefined and the
    // defensive mapping below turns them into safe defaults.
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (huntError) return { ok: false, error: "Could not load this pheno hunt." };
  if (!huntRow) return { ok: false, error: "Pheno hunt not found." };

  const { data: plantRows, error: plantsError } = await supabase
    .from("plants")
    .select("id, name, candidate_label, strain, stage, grow_id, tent_id, photo_url, is_archived")
    .eq("pheno_hunt_id", id)
    .eq("is_archived", false);

  if (plantsError) return { ok: false, error: "Could not load hunt candidates." };

  const plants = (plantRows ?? []) as PhenoHuntCandidatePlantRow[];
  const plantIds = plants.map((p) => p.id).filter((v): v is string => typeof v === "string" && v.length > 0);

  // Independent lookups — one round trip instead of two serial hops on the
  // workspace's critical loading path. Evidence tables are RLS-scoped by
  // hunt_id (and the caller owns the hunt), so cross-hunt / cross-user data
  // never reaches this map. Requests are scoped by hunt_id AND plant_id so
  // stray orphan rows from a deleted candidate can't leak either.
  const [growNameById, tentNameById, scoreByPlantId, smokeTestByPlantId, labResultByPlantId] =
    await Promise.all([
      loadNameMap("grows", distinct([huntRow.grow_id, ...plants.map((p) => p.grow_id)])),
      loadNameMap("tents", distinct([huntRow.tent_id, ...plants.map((p) => p.tent_id)])),
      loadCandidateScores(id, plantIds),
      loadSmokeTests(id, plantIds),
      loadLabResults(id, plantIds),
    ]);

  const candidates = adaptPhenoHuntCandidates({
    plants,
    growNameById,
    tentNameById,
    scoreByPlantId,
    smokeTestByPlantId,
    labResultByPlantId,
  });


  const rawGoals = (huntRow as { evidence_goals?: unknown }).evidence_goals;
  const evidenceGoals = Array.isArray(rawGoals)
    ? rawGoals.filter((v): v is string => typeof v === "string")
    : [];
  const rawNotes = (huntRow as { notes?: unknown }).notes;
  const notes = typeof rawNotes === "string" ? rawNotes : null;
  const rawSetup = (huntRow as { setup_completed_at?: unknown }).setup_completed_at;
  const setupCompletedAt = typeof rawSetup === "string" ? rawSetup : null;

  return {
    ok: true,
    hunt: {
      id: huntRow.id,
      name: huntRow.name,
      growId: huntRow.grow_id ?? null,
      tentId: huntRow.tent_id ?? null,
      evidenceGoals,
      notes,
      setupCompletedAt,
    },
    candidates,
  };
}

function distinct(ids: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of ids) if (typeof v === "string" && v.length > 0) out.add(v);
  return Array.from(out);
}

/** Load an id → name map for a table with `id` + `name` columns. Best-effort. */
async function loadNameMap(
  table: "grows" | "tents",
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from(table).select("id, name").in("id", ids);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data as Array<{ id: string; name: string | null }>) {
    if (row.id && typeof row.name === "string") map[row.id] = row.name;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Evidence loaders — RLS-scoped SELECT only, always filtered by hunt_id AND
// plant_id. Best-effort: any failure returns an empty map and readiness
// engines simply see "no evidence" (never fake-complete).
// ---------------------------------------------------------------------------

async function loadCandidateScores(
  huntId: string,
  plantIds: string[],
): Promise<Record<string, PhenoHuntCandidateScoreEvidence>> {
  if (plantIds.length === 0) return {};
  const { data, error } = await phenoDb
    .from("pheno_candidate_scores")
    .select("plant_id, traits, note")
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) return {};
  const map: Record<string, PhenoHuntCandidateScoreEvidence> = {};
  for (const row of data) {
    if (!row.plant_id || map[row.plant_id]) continue;
    const traits =
      row.traits && typeof row.traits === "object" && !Array.isArray(row.traits)
        ? (row.traits as Record<string, number>)
        : null;
    map[row.plant_id] = { traits, note: typeof row.note === "string" ? row.note : null };
  }
  return map;
}

async function loadSmokeTests(
  huntId: string,
  plantIds: string[],
): Promise<Record<string, PhenoHuntCandidateSmokeEvidence>> {
  if (plantIds.length === 0) return {};
  const { data, error } = await phenoDb
    .from("pheno_smoke_tests")
    .select(
      "plant_id, flavor_descriptors, effect_descriptors, smoothness, potency_impression, verdict",
    )
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) return {};
  const map: Record<string, PhenoHuntCandidateSmokeEvidence> = {};
  for (const row of data) {
    if (!row.plant_id || map[row.plant_id]) continue;
    map[row.plant_id] = {
      flavorDescriptors: Array.isArray(row.flavor_descriptors)
        ? (row.flavor_descriptors.filter((v) => typeof v === "string") as string[])
        : null,
      effectDescriptors: Array.isArray(row.effect_descriptors)
        ? (row.effect_descriptors.filter((v) => typeof v === "string") as string[])
        : null,
      smoothness: typeof row.smoothness === "number" ? row.smoothness : null,
      potencyImpression: typeof row.potency_impression === "number" ? row.potency_impression : null,
      verdict: typeof row.verdict === "string" ? row.verdict : null,
    };
  }
  return map;
}

/** Prefer COA > estimate > unspecified when multiple lab rows exist per plant. */
const LAB_SOURCE_RANK: Record<string, number> = { coa: 3, estimate: 2, unspecified: 1 };
function normalizeLabSource(v: unknown): "coa" | "estimate" | "unspecified" {
  return v === "coa" || v === "estimate" ? v : "unspecified";
}

async function loadLabResults(
  huntId: string,
  plantIds: string[],
): Promise<Record<string, PhenoHuntCandidateLabEvidence>> {
  if (plantIds.length === 0) return {};
  const { data, error } = await phenoDb
    .from("pheno_lab_results")
    .select("plant_id, source, thc_pct, cbd_pct, total_cannabinoids_pct, dominant_terpenes")
    .eq("hunt_id", huntId)
    .in("plant_id", plantIds);
  if (error || !data) return {};
  const map: Record<string, PhenoHuntCandidateLabEvidence> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    const source = normalizeLabSource(row.source);
    const existing = map[row.plant_id];
    if (existing && LAB_SOURCE_RANK[existing.source] >= LAB_SOURCE_RANK[source]) continue;
    const terps = Array.isArray(row.dominant_terpenes)
      ? (row.dominant_terpenes
          .filter(
            (t): t is { name: string; pct?: number | null } =>
              !!t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string",
          )
          .map((t) => ({
            name: (t as { name: string }).name,
            pct:
              typeof (t as { pct?: unknown }).pct === "number"
                ? ((t as { pct: number }).pct as number)
                : null,
          })) as ReadonlyArray<{ name: string; pct: number | null }>)
      : null;
    map[row.plant_id] = {
      thcPct: typeof row.thc_pct === "number" ? row.thc_pct : null,
      cbdPct: typeof row.cbd_pct === "number" ? row.cbd_pct : null,
      totalCannabinoidsPct:
        typeof row.total_cannabinoids_pct === "number" ? row.total_cannabinoids_pct : null,
      dominantTerpenes: terps,
      source,
    };
  }
  return map;
}


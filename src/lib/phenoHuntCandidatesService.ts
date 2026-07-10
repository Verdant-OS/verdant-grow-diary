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
  type PhenoHuntCandidatePlantRow,
} from "@/lib/phenoHuntCandidateAdapter";
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

  // Independent lookups — one round trip instead of two serial hops on the
  // workspace's critical loading path.
  const [growNameById, tentNameById] = await Promise.all([
    loadNameMap("grows", distinct([huntRow.grow_id, ...plants.map((p) => p.grow_id)])),
    loadNameMap("tents", distinct([huntRow.tent_id, ...plants.map((p) => p.tent_id)])),
  ]);

  const candidates = adaptPhenoHuntCandidates({ plants, growNameById, tentNameById });

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

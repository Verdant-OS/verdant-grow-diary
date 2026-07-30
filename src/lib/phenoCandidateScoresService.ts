/**
 * phenoCandidateScoresService — RLS-scoped read/write for a grower's own
 * candidate trait scores (pheno_candidate_scores).
 *
 * This is a NORMAL user-data write (the grower recording their own 1-5/loud
 * trait scores on their own hunt), enforced by RLS: every insert/update must
 * satisfy auth.uid()=user_id AND caller owns the hunt AND the plant, with the
 * plant a candidate of that hunt. No service_role, no AI, no Action Queue, no
 * device control, no automation. Recording a score acts on nothing.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { PhenoEvidenceReadError } from "@/lib/phenoEvidenceReadError";

export interface CandidateScoreRow {
  readonly plantId: string;
  readonly traits: Record<string, number>;
  readonly note: string | null;
}

export interface CandidateScorePlantRef {
  readonly plantId: string;
  readonly huntId: string;
}

export interface CandidateScoreForPlantRow extends CandidateScoreRow {
  readonly huntId: string;
  readonly updatedAt: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Upsert the grower's trait scores for one candidate (one card per hunt+plant). */
export async function upsertCandidateScore(input: {
  huntId: string;
  plantId: string;
  traits: Record<string, number>;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save scores." };
  const { error } = await phenoDb.from("pheno_candidate_scores").upsert(
    {
      user_id: userId,
      hunt_id: input.huntId,
      plant_id: input.plantId,
      traits: input.traits,
      note: input.note ?? null,
    },
    { onConflict: "hunt_id,plant_id" },
  );
  if (error) return { ok: false, error: "Could not save this score." };
  return { ok: true };
}

/** Load all trait-score cards for a hunt, keyed by plant id. RLS-scoped read. */
export async function listCandidateScoresForHunt(
  huntId: string,
  plantIds?: readonly string[],
): Promise<Record<string, CandidateScoreRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  let query = phenoDb
    .from("pheno_candidate_scores")
    .select("plant_id, traits, note")
    .eq("hunt_id", id);
  // Page-scoped read: fetch only the visible candidates' scores at scale.
  if (plantIds && plantIds.length > 0) query = query.in("plant_id", plantIds as string[]);
  const { data, error } = await query;
  if (error || !data) throw new PhenoEvidenceReadError("candidate_scores");
  const map: Record<string, CandidateScoreRow> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    const traits =
      row.traits && typeof row.traits === "object" && !Array.isArray(row.traits)
        ? (row.traits as Record<string, number>)
        : {};
    map[row.plant_id] = { plantId: row.plant_id, traits, note: row.note ?? null };
  }
  return map;
}

/**
 * Load the current score card for a bounded set of exact plant+hunt pairs.
 *
 * The diary comparison spans two cultivar labels and may therefore cross
 * several hunts. We still filter each returned row against the caller's exact
 * pair after the RLS-scoped query, so a stale score from a plant's previous
 * hunt can never be presented as current editable evidence.
 */
export async function listCandidateScoresForPlants(
  refs: readonly CandidateScorePlantRef[] | null | undefined,
): Promise<Record<string, CandidateScoreForPlantRow>> {
  const uniqueRefs = [
    ...new Map(
      (refs ?? [])
        .map((ref) => ({
          plantId: typeof ref?.plantId === "string" ? ref.plantId.trim() : "",
          huntId: typeof ref?.huntId === "string" ? ref.huntId.trim() : "",
        }))
        .filter((ref) => ref.plantId && ref.huntId)
        .map((ref) => [`${ref.plantId}:${ref.huntId}`, ref]),
    ).values(),
  ].sort((a, b) => a.plantId.localeCompare(b.plantId) || a.huntId.localeCompare(b.huntId));
  if (uniqueRefs.length === 0) return {};

  const allowedPairs = new Set(uniqueRefs.map((ref) => `${ref.plantId}:${ref.huntId}`));
  const rows: Array<{
    plant_id: string | null;
    hunt_id: string | null;
    traits: unknown;
    note: string | null;
    updated_at: string | null;
  }> = [];

  const chunkSize = 100;
  for (let offset = 0; offset < uniqueRefs.length; offset += chunkSize) {
    const chunk = uniqueRefs.slice(offset, offset + chunkSize);
    const plantIds = [...new Set(chunk.map((ref) => ref.plantId))];
    const huntIds = [...new Set(chunk.map((ref) => ref.huntId))];
    const { data, error } = await phenoDb
      .from("pheno_candidate_scores")
      .select("plant_id, hunt_id, traits, note, updated_at")
      .in("plant_id", plantIds)
      .in("hunt_id", huntIds)
      .order("updated_at", { ascending: false });
    if (error || !data) throw new PhenoEvidenceReadError("candidate_scores");
    rows.push(...data);
  }

  rows.sort(
    (a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? "") ||
      (a.plant_id ?? "").localeCompare(b.plant_id ?? "") ||
      (a.hunt_id ?? "").localeCompare(b.hunt_id ?? ""),
  );

  const map: Record<string, CandidateScoreForPlantRow> = {};
  for (const row of rows) {
    const plantId = row.plant_id?.trim();
    const huntId = row.hunt_id?.trim();
    if (!plantId || !huntId || !allowedPairs.has(`${plantId}:${huntId}`) || map[plantId]) continue;
    const traits =
      row.traits && typeof row.traits === "object" && !Array.isArray(row.traits)
        ? (row.traits as Record<string, number>)
        : {};
    map[plantId] = {
      plantId,
      huntId,
      traits,
      note: row.note ?? null,
      updatedAt: row.updated_at ?? null,
    };
  }
  return map;
}

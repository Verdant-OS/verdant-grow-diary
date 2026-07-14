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

export interface CandidateScoreRow {
  readonly plantId: string;
  readonly traits: Record<string, number>;
  readonly note: string | null;
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
  if (error || !data) return {};
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

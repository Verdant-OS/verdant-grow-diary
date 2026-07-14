/**
 * phenoKeeperDecisionService — RLS-scoped read/write for a grower's own keeper
 * decisions (pheno_keeper_decisions): keep / cull / hold / undecided.
 *
 * Suggest-only DATA. Recording a decision is a note to self — it NEVER removes,
 * keeps, or acts on a plant or device. Any follow-up a decision implies routes
 * through the approval-required Action Queue in a later slice, never from here.
 * RLS enforces auth.uid()=user_id + hunt+plant ownership + candidate
 * consistency. No service_role, no AI, no automation, no plant deletes.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { normalizeKeeperDecision, type PhenoKeeperDecision } from "@/lib/phenoKeeperDecisionModel";

export interface KeeperDecisionRow {
  readonly plantId: string;
  readonly decision: PhenoKeeperDecision;
  readonly note: string | null;
  readonly decidedAt: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Record (upsert) the grower's keeper decision for one candidate. */
export async function recordKeeperDecision(input: {
  huntId: string;
  plantId: string;
  decision: PhenoKeeperDecision;
  note?: string | null;
  decidedAt?: string;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to record a decision." };
  const { error } = await phenoDb.from("pheno_keeper_decisions").upsert(
    {
      user_id: userId,
      hunt_id: input.huntId,
      plant_id: input.plantId,
      decision: input.decision,
      note: input.note ?? null,
      decided_at: input.decidedAt ?? new Date().toISOString(),
    },
    { onConflict: "hunt_id,plant_id" },
  );
  if (error) return { ok: false, error: "Could not record this decision." };
  return { ok: true };
}

/** Load keeper decisions for a hunt, keyed by plant id. RLS-scoped read. */
export async function listKeeperDecisionsForHunt(
  huntId: string,
  plantIds?: readonly string[],
): Promise<Record<string, KeeperDecisionRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  let query = phenoDb
    .from("pheno_keeper_decisions")
    .select("plant_id, decision, note, decided_at")
    .eq("hunt_id", id);
  // Page-scoped read: fetch only the visible candidates' decisions at scale.
  if (plantIds && plantIds.length > 0) query = query.in("plant_id", plantIds as string[]);
  const { data, error } = await query;
  if (error || !data) return {};
  const map: Record<string, KeeperDecisionRow> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    map[row.plant_id] = {
      plantId: row.plant_id,
      decision: normalizeKeeperDecision(row.decision),
      note: row.note ?? null,
      decidedAt: row.decided_at ?? null,
    };
  }
  return map;
}

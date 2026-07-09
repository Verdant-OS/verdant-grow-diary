/**
 * phenoKeeperDecisionLogService — append-only audit trail of keeper decisions
 * (pheno_keeper_decisions_log). Every keep / cull / hold / undecided the grower
 * records is an immutable row with a required reason; the current decision is
 * the latest row per candidate.
 *
 * Insert-only (the table grants no UPDATE/DELETE). RLS enforces
 * auth.uid()=user_id + hunt+plant ownership + candidate consistency. Suggest-
 * only: recording a decision acts on nothing. No service_role, no AI, no
 * automation, no plant deletes.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import {
  normalizeKeeperDecision,
  keeperDecisionLabel,
  type PhenoKeeperDecision,
} from "@/lib/phenoKeeperDecisionModel";

export interface KeeperDecisionLogEntry {
  readonly plantId: string;
  readonly decision: PhenoKeeperDecision;
  readonly reason: string;
  readonly note: string | null;
  readonly decidedAt: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Append one immutable decision to the audit log. Reason is required and never blank. */
export async function appendKeeperDecision(input: {
  huntId: string;
  plantId: string;
  decision: PhenoKeeperDecision;
  reason?: string | null;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to record a decision." };
  const decision = normalizeKeeperDecision(input.decision);
  const reason =
    typeof input.reason === "string" && input.reason.trim().length > 0
      ? input.reason.trim()
      : `Recorded ${keeperDecisionLabel(decision)}`;
  const { error } = await phenoDb.from("pheno_keeper_decisions_log").insert({
    user_id: userId,
    hunt_id: input.huntId,
    plant_id: input.plantId,
    decision,
    reason,
    note: input.note ?? null,
  });
  if (error) return { ok: false, error: "Could not record this decision." };
  return { ok: true };
}

/**
 * One candidate's own decision history, newest first. The workspace fetches
 * this on demand when a card's history section is opened: a hunt-wide read
 * capped at N rows is unfair at commercial scale (300 candidates share the
 * cap and most get zero rows), while per-candidate reads ride the
 * (hunt_id, plant_id, decided_at DESC) index and stay small.
 */
export async function listKeeperDecisionHistoryForPlant(
  huntId: string,
  plantId: string,
): Promise<KeeperDecisionLogEntry[]> {
  const hunt = typeof huntId === "string" ? huntId.trim() : "";
  const plant = typeof plantId === "string" ? plantId.trim() : "";
  if (!hunt || !plant) return [];
  const { data, error } = await phenoDb
    .from("pheno_keeper_decisions_log")
    .select("plant_id, decision, reason, note, decided_at")
    .eq("hunt_id", hunt)
    .eq("plant_id", plant)
    .order("decided_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((row) => ({
    plantId: plant,
    decision: normalizeKeeperDecision(row.decision),
    reason: typeof row.reason === "string" ? row.reason : "",
    note: row.note ?? null,
    decidedAt: row.decided_at ?? null,
  }));
}

/** Full decision history for a hunt, newest first, keyed by plant id. */
export async function listKeeperDecisionHistoryForHunt(
  huntId: string,
): Promise<Record<string, KeeperDecisionLogEntry[]>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  const { data, error } = await phenoDb
    .from("pheno_keeper_decisions_log")
    .select("plant_id, decision, reason, note, decided_at")
    .eq("hunt_id", id)
    .order("decided_at", { ascending: false })
    // Bounded recent history (newest first): the log is append-only and
    // grows forever; the workspace/keepers views only render recent
    // decisions per candidate (scale audit C1).
    .limit(500);
  if (error || !data) return {};
  const map: Record<string, KeeperDecisionLogEntry[]> = {};
  for (const row of data) {
    if (!row.plant_id) continue;
    (map[row.plant_id] ??= []).push({
      plantId: row.plant_id,
      decision: normalizeKeeperDecision(row.decision),
      reason: typeof row.reason === "string" ? row.reason : "",
      note: row.note ?? null,
      decidedAt: row.decided_at ?? null,
    });
  }
  return map;
}

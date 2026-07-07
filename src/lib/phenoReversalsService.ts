/**
 * phenoReversalsService — record + read chemical reversals on keepers.
 *
 * A reversal is a grower applying STS / colloidal silver / GA3 to a female
 * keeper so it makes pollen. The pheno_reversals table is APPEND-ONLY (see the
 * B2 migration): a keeper is "reversed" iff a row exists for it, exactly like
 * herm is derived from sex observations. Nothing here reverses a real plant,
 * collects pollen, or acts — it records the grower's own action.
 *
 * RLS scopes every read/write to the owner and requires ownership of the
 * referenced keeper. This service only shapes rows; the DB enforces privacy.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { isReversalMethod, type ReversalMethod } from "@/lib/genetics/breedingReproductionRules";

export interface ReversalRow {
  readonly id: string;
  readonly keeperId: string;
  readonly method: string;
  readonly note: string | null;
  readonly appliedAt: string | null;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Record a chemical reversal applied to a keeper (append-only). */
export async function recordReversal(input: {
  keeperId: string;
  method?: ReversalMethod | string | null;
  note?: string | null;
  appliedAt?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to record a reversal." };
  const keeperId = (input.keeperId ?? "").trim();
  if (!keeperId) return { ok: false, error: "Choose the keeper you reversed." };
  // Unknown/blank methods fall back to STS (the DB CHECK only accepts the four
  // recognized methods; recording something is better than blocking the log).
  const method = isReversalMethod(input.method) ? input.method : "sts";

  const { data, error } = await phenoDb
    .from("pheno_reversals")
    .insert({
      user_id: userId,
      keeper_id: keeperId,
      method,
      note: input.note ?? null,
      applied_at: input.appliedAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: "Could not record this reversal." };
  return { ok: true, id: data.id };
}

/** Reversals recorded for a keeper, most recent first. */
export async function listReversalsForKeeper(keeperId: string): Promise<ReversalRow[]> {
  const id = typeof keeperId === "string" ? keeperId.trim() : "";
  if (!id) return [];
  const { data, error } = await phenoDb
    .from("pheno_reversals")
    .select("id, keeper_id, method, note, applied_at")
    .eq("keeper_id", id)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    keeperId: r.keeper_id,
    method: r.method,
    note: r.note ?? null,
    appliedAt: r.applied_at ?? null,
  }));
}

/**
 * Distinct keeper ids the current user has reversed. UI uses this with
 * isKeeperReversed() to badge keepers and gate selfing/feminized crosses.
 */
export async function listReversedKeeperIds(): Promise<string[]> {
  const { data, error } = await phenoDb.from("pheno_reversals").select("keeper_id");
  if (error || !data) return [];
  const ids = new Set<string>();
  for (const r of data) if (r.keeper_id) ids.add(r.keeper_id);
  return [...ids];
}

/** Whether a keeper has at least one reversal record. */
export async function hasReversal(keeperId: string): Promise<boolean> {
  const id = typeof keeperId === "string" ? keeperId.trim() : "";
  if (!id) return false;
  const { data, error } = await phenoDb
    .from("pheno_reversals")
    .select("id")
    .eq("keeper_id", id)
    .limit(1);
  if (error || !data) return false;
  return data.length > 0;
}

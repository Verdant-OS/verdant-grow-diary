/**
 * Pheno Hunt service — pure business logic.
 *
 * Builds candidate labels and persists a hunt + plant tags.
 * No React, no toasts, no AI, no alerts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";

export interface CreatePhenoHuntInput {
  growId: string;
  tentId?: string | null;
  name: string;
  /**
   * Grower-stated hunt goal, persisted on the hunt row so "continue setup"
   * and the workspace Evidence Packet Map can restore it. Blank -> NULL.
   */
  goal?: string | null;
  /** Plant IDs to tag as candidates. Order determines default labels. */
  plantIds: readonly string[];
  /** Optional per-plant label overrides. */
  labels?: Readonly<Record<string, string>>;
}

export interface CreatePhenoHuntResult {
  huntId: string;
  taggedPlantIds: string[];
}

export class PhenoHuntError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "PhenoHuntError";
  }
}

/** "#1", "#2"... — used when no label override is supplied. */
export function defaultCandidateLabel(index: number): string {
  return `#${index + 1}`;
}

/** Default hunt name based on the grow name. */
export function defaultHuntName(growName: string | null | undefined): string {
  const trimmed = (growName ?? "").trim();
  return trimmed ? `${trimmed} Pheno Hunt` : "Pheno Hunt";
}

export interface PhenoHuntDraft {
  name: string;
  plantIds: readonly string[];
}

export type PhenoHuntValidationError = "name_required" | "grow_required" | "no_candidates";

export function validatePhenoHuntDraft(
  draft: PhenoHuntDraft,
  growId: string | null | undefined,
): PhenoHuntValidationError[] {
  const errs: PhenoHuntValidationError[] = [];
  if (!draft.name.trim()) errs.push("name_required");
  if (!growId) errs.push("grow_required");
  if (draft.plantIds.length === 0) errs.push("no_candidates");
  return errs;
}

export async function createPhenoHunt(
  input: CreatePhenoHuntInput,
  client: SupabaseClient = defaultClient,
): Promise<CreatePhenoHuntResult> {
  const name = input.name.trim();
  if (!name) throw new PhenoHuntError("Hunt name is required.");
  if (!input.growId) throw new PhenoHuntError("Grow is required.");
  if (input.plantIds.length === 0) {
    throw new PhenoHuntError("Select at least one candidate plant.");
  }

  const goal = input.goal?.trim() || null;

  const { data: hunt, error: huntErr } = await client
    .from("pheno_hunts")
    .insert({
      grow_id: input.growId,
      tent_id: input.tentId ?? null,
      name,
      goal,
    } as never)
    .select("id")
    .single();

  if (huntErr || !hunt) {
    throw new PhenoHuntError(huntErr?.message ?? "Could not create pheno hunt.", huntErr);
  }

  const huntId = (hunt as { id: string }).id;
  const tagged: string[] = [];

  // Tag each candidate plant. Per-plant updates keep each label correct and
  // RLS-scoped without smuggling other plants' rows into a bulk update, but
  // run in bounded-concurrency chunks so a 100-candidate hunt is ~10 round
  // trips of wall clock, not 100 serial ones (scale audit M1).
  const TAG_CHUNK_SIZE = 10;
  for (let start = 0; start < input.plantIds.length; start += TAG_CHUNK_SIZE) {
    const chunk = input.plantIds.slice(start, start + TAG_CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (plantId, offset) => {
        const override = input.labels?.[plantId]?.trim();
        const label =
          override && override.length > 0 ? override : defaultCandidateLabel(start + offset);
        const { error: updErr } = await client
          .from("plants")
          .update({
            pheno_hunt_id: huntId,
            candidate_label: label,
          } as never)
          .eq("id", plantId);
        return { plantId, updErr };
      }),
    );
    const failed = results.find((r) => r.updErr);
    for (const r of results) {
      if (!r.updErr) tagged.push(r.plantId);
    }
    if (failed?.updErr) {
      // Best-effort rollback: untag anything already tagged, then remove the
      // hunt row (RLS allows the owner to delete/update own rows). Rollback
      // failures are swallowed — they must never mask the original error.
      if (tagged.length > 0) {
        try {
          await client
            .from("plants")
            .update({ pheno_hunt_id: null, candidate_label: null } as never)
            .in("id", tagged);
        } catch {
          // best-effort only
        }
      }
      await client.from("pheno_hunts").delete().eq("id", huntId);
      throw new PhenoHuntError(
        `Could not tag candidate plant: ${failed.updErr.message}`,
        failed.updErr,
      );
    }
  }

  return { huntId, taggedPlantIds: tagged };
}

export interface PhenoHuntSetupCandidate {
  id: string;
  name: string;
  candidateLabel: string | null;
}

export interface PhenoHuntSetupState {
  huntId: string;
  name: string;
  goal: string | null;
  growId: string | null;
  tentId: string | null;
  /** NULL while setup is unconfirmed ("continue setup"). */
  setupConfirmedAt: string | null;
  candidates: PhenoHuntSetupCandidate[];
}

/**
 * Load the persisted setup state for a hunt (goal + confirmation stamp +
 * tagged candidates). RLS-scoped to the owner; SELECT only.
 */
export async function loadPhenoHuntSetup(
  huntId: string,
  client: SupabaseClient = defaultClient,
): Promise<PhenoHuntSetupState> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) throw new PhenoHuntError("Hunt id is required.");

  const { data: hunt, error: huntErr } = await client
    .from("pheno_hunts")
    .select("id, name, goal, grow_id, tent_id, setup_confirmed_at")
    .eq("id", id)
    .maybeSingle();

  if (huntErr) {
    throw new PhenoHuntError(`Could not load hunt setup: ${huntErr.message}`, huntErr);
  }
  if (!hunt) throw new PhenoHuntError("Pheno hunt not found.");

  const { data: plants, error: plantsErr } = await client
    .from("plants")
    .select("id, name, candidate_label")
    .eq("pheno_hunt_id", id)
    .eq("is_archived", false);

  if (plantsErr) {
    throw new PhenoHuntError(`Could not load hunt candidates: ${plantsErr.message}`, plantsErr);
  }

  const row = hunt as {
    id: string;
    name: string;
    goal: string | null;
    grow_id: string | null;
    tent_id: string | null;
    setup_confirmed_at: string | null;
  };

  return {
    huntId: row.id,
    name: row.name,
    goal: row.goal ?? null,
    growId: row.grow_id ?? null,
    tentId: row.tent_id ?? null,
    setupConfirmedAt: row.setup_confirmed_at ?? null,
    candidates: ((plants ?? []) as Array<{
      id: string;
      name: string;
      candidate_label: string | null;
    }>).map((p) => ({
      id: p.id,
      name: p.name,
      candidateLabel: p.candidate_label ?? null,
    })),
  };
}

export interface UpdatePhenoHuntGoalInput {
  huntId: string;
  goal: string;
}

/**
 * Update the persisted goal. RLS (owner row policies + RESTRICTIVE
 * has_pheno_tracker_entitlement) rejects Free/canceled/expired writers at
 * the database; the rejection surfaces as a PhenoHuntError.
 */
export async function updatePhenoHuntGoal(
  input: UpdatePhenoHuntGoalInput,
  client: SupabaseClient = defaultClient,
): Promise<{ goal: string }> {
  if (!input.huntId) throw new PhenoHuntError("Hunt id is required.");
  const goal = input.goal.trim();
  if (!goal) throw new PhenoHuntError("Hunt goal is required.");
  if (goal.length > 500) throw new PhenoHuntError("Hunt goal is too long (max 500 characters).");

  const { error } = await client
    .from("pheno_hunts")
    .update({ goal } as never)
    .eq("id", input.huntId);

  if (error) {
    throw new PhenoHuntError(`Could not save hunt goal: ${error.message}`, error);
  }
  return { goal };
}

export interface ConfirmPhenoHuntSetupInput {
  huntId: string;
  /** Injectable for tests; defaults to now. */
  confirmedAtIso?: string;
}

/**
 * Stamp setup_confirmed_at. Idempotent: only a NULL stamp is written, and the
 * authoritative stamp is re-read afterwards, so re-confirming never moves an
 * existing timestamp. Entitlement-blocked writers surface a PhenoHuntError
 * (RLS rejection) — never a silent fake success.
 */
export async function confirmPhenoHuntSetup(
  input: ConfirmPhenoHuntSetupInput,
  client: SupabaseClient = defaultClient,
): Promise<{ setupConfirmedAt: string }> {
  if (!input.huntId) throw new PhenoHuntError("Hunt id is required.");
  const stamp = input.confirmedAtIso ?? new Date().toISOString();

  const { error: updErr } = await client
    .from("pheno_hunts")
    .update({ setup_confirmed_at: stamp } as never)
    .eq("id", input.huntId)
    .is("setup_confirmed_at", null);

  if (updErr) {
    throw new PhenoHuntError(`Could not confirm hunt setup: ${updErr.message}`, updErr);
  }

  const { data, error: selErr } = await client
    .from("pheno_hunts")
    .select("setup_confirmed_at")
    .eq("id", input.huntId)
    .maybeSingle();

  if (selErr) {
    throw new PhenoHuntError(`Could not read setup confirmation: ${selErr.message}`, selErr);
  }
  const confirmedAt = (data as { setup_confirmed_at: string | null } | null)
    ?.setup_confirmed_at;
  if (!confirmedAt) {
    throw new PhenoHuntError("Hunt setup was not confirmed (hunt missing or write rejected).");
  }
  return { setupConfirmedAt: confirmedAt };
}

export interface DeletePhenoHuntInput {
  huntId: string;
}

export interface DeletePhenoHuntResult {
  huntId: string;
  untaggedPlantIds: string[];
}

/**
 * Delete a Pheno Hunt safely:
 *   1. Untag every plant linked to the hunt (pheno_hunt_id = null,
 *      candidate_label = null).
 *   2. Delete the pheno_hunts row.
 *
 * If step 1 fails the hunt row is left intact. Never deletes plants,
 * diary entries, photos, sensor readings, alerts, or action queue rows.
 * Relies on RLS — never uses service_role.
 */
export async function deletePhenoHunt(
  input: DeletePhenoHuntInput,
  client: SupabaseClient = defaultClient,
): Promise<DeletePhenoHuntResult> {
  const huntId = input.huntId;
  if (!huntId) throw new PhenoHuntError("Hunt id is required.");

  // Fetch linked plants up front so we can report what was untagged and
  // avoid relying on a returning-clause on the bulk update.
  const { data: linked, error: selErr } = await client
    .from("plants")
    .select("id")
    .eq("pheno_hunt_id", huntId);

  if (selErr) {
    throw new PhenoHuntError(`Could not read linked plants: ${selErr.message}`, selErr);
  }

  const linkedIds = (linked ?? []).map((r) => (r as { id: string }).id);

  if (linkedIds.length > 0) {
    const { error: untagErr } = await client
      .from("plants")
      .update({
        pheno_hunt_id: null,
        candidate_label: null,
      } as never)
      .eq("pheno_hunt_id", huntId);

    if (untagErr) {
      throw new PhenoHuntError(`Could not untag linked plants: ${untagErr.message}`, untagErr);
    }
  }

  const { error: delErr } = await client.from("pheno_hunts").delete().eq("id", huntId);

  if (delErr) {
    throw new PhenoHuntError(`Could not delete pheno hunt: ${delErr.message}`, delErr);
  }

  return { huntId, untaggedPlantIds: linkedIds };
}

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
  /** Plant IDs to tag as candidates. Order determines default labels. */
  plantIds: readonly string[];
  /** Optional per-plant label overrides. */
  labels?: Readonly<Record<string, string>>;
  /** Selected evidence goal ids captured during onboarding. */
  evidenceGoals?: readonly string[];
  /** Optional hunt notes captured during onboarding basics step. */
  notes?: string | null;
  /**
   * When true, records `setup_completed_at = now()` on the created hunt.
   * When false/undefined the hunt is created with setup still pending so the
   * workspace shows a "Continue setup" progress card.
   */
  markSetupComplete?: boolean;
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

/** Known evidence goal ids — mirrors phenoEvidenceGoals to avoid an import
 * cycle in tests that stub the goals module. Sanitizer only allows short
 * text keys and dedupes. */
const KNOWN_EVIDENCE_GOAL_IDS = new Set([
  "structure",
  "vigor",
  "aroma",
  "resin",
  "stretch",
  "stress_resistance",
  "disease_resistance",
  "yield",
  "post_harvest",
  "post_cure",
  "replication_readiness",
  "keeper_decision",
]);

export function sanitizeEvidenceGoals(
  input: readonly string[] | null | undefined,
): string[] {
  if (!input || !Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (!v || v.length > 64) continue;
    if (!KNOWN_EVIDENCE_GOAL_IDS.has(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= 32) break;
  }
  return out;
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

  // Sanitize evidence goals into a bounded list of short text keys — never
  // leak arbitrary client-supplied JSON into the DB. The DB check constraint
  // also enforces jsonb array type, but this is the app-layer guard.
  const evidenceGoals = sanitizeEvidenceGoals(input.evidenceGoals);
  const trimmedNotes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim().slice(0, 4000)
      : null;

  const insertRow: Record<string, unknown> = {
    grow_id: input.growId,
    tent_id: input.tentId ?? null,
    name,
    evidence_goals: evidenceGoals,
    notes: trimmedNotes,
  };
  if (input.markSetupComplete) {
    insertRow.setup_completed_at = new Date().toISOString();
  }

  const { data: hunt, error: huntErr } = await client
    .from("pheno_hunts")
    .insert(insertRow as never)
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

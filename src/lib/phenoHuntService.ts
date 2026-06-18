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
}

export interface CreatePhenoHuntResult {
  huntId: string;
  taggedPlantIds: string[];
}

export class PhenoHuntError extends Error {
  constructor(message: string, public cause?: unknown) {
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

export type PhenoHuntValidationError =
  | "name_required"
  | "grow_required"
  | "no_candidates";

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

  const { data: hunt, error: huntErr } = await client
    .from("pheno_hunts")
    .insert({
      grow_id: input.growId,
      tent_id: input.tentId ?? null,
      name,
    } as never)
    .select("id")
    .single();

  if (huntErr || !hunt) {
    throw new PhenoHuntError(
      huntErr?.message ?? "Could not create pheno hunt.",
      huntErr,
    );
  }

  const huntId = (hunt as { id: string }).id;
  const tagged: string[] = [];

  // Tag each candidate plant. Per-plant update keeps each label correct and
  // RLS-scoped without smuggling other plants' rows into a bulk update.
  for (let i = 0; i < input.plantIds.length; i++) {
    const plantId = input.plantIds[i];
    const override = input.labels?.[plantId]?.trim();
    const label = override && override.length > 0
      ? override
      : defaultCandidateLabel(i);

    const { error: updErr } = await client
      .from("plants")
      .update({
        pheno_hunt_id: huntId,
        candidate_label: label,
      } as never)
      .eq("id", plantId);

    if (updErr) {
      // Best-effort rollback of the hunt row (RLS allows the owner to delete).
      await client.from("pheno_hunts").delete().eq("id", huntId);
      throw new PhenoHuntError(
        `Could not tag candidate plant: ${updErr.message}`,
        updErr,
      );
    }
    tagged.push(plantId);
  }

  return { huntId, taggedPlantIds: tagged };
}

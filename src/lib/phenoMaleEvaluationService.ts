/**
 * phenoMaleEvaluationService — RLS-scoped read/write for a grower's own male
 * evaluation cards (pheno_male_evaluations) and their pollen viability tests
 * (pheno_pollen_viability_tests).
 *
 * This is a NORMAL user-data write: the grower recording their own 1-10 rubric
 * ratings and pollen viability reads on their own male plant, enforced by RLS
 * (auth.uid()=user_id, caller owns the plant, and — when a hunt is named — owns
 * the hunt with the plant a candidate of it). The viability-tests table is
 * APPEND-ONLY (SELECT+INSERT only), so each test is an immutable record.
 *
 * No service_role, no AI, no alerts, no Action Queue, no device control, no
 * automation. Nothing here ranks males, names a "best" one, or promotes one —
 * the workbook's promotion decision stays an operator choice. This service only
 * shapes rows and composes the pure model (summarizeMaleEvaluation); the DB
 * enforces privacy and the value CHECKs.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";
import { PhenoEvidenceReadError } from "@/lib/phenoEvidenceReadError";
import {
  isValidMaleScore,
  normalizePollenViabilityResult,
  summarizeMaleEvaluation,
  MIN_MALE_SCORE,
  MAX_MALE_SCORE,
  type PhenoMaleEvaluationAxis,
  type PhenoMaleEvaluationInput,
  type PhenoMaleEvaluationSummary,
  type PhenoMaleRatingInput,
  type PollenViabilityResult,
} from "@/lib/phenoMaleEvaluationRules";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

/** A viability test as persisted (append-only row), mapped to camelCase. */
export interface PollenViabilityTestRow {
  readonly id: string;
  readonly evaluationId: string;
  readonly result: PollenViabilityResult;
  readonly germinationPct: number | null;
  readonly note: string | null;
  readonly testedAt: string | null;
  readonly createdAt: string | null;
}

/** A loaded evaluation card plus the model summary composed from it. */
export interface LoadedMaleEvaluation {
  readonly evaluationId: string;
  readonly input: PhenoMaleEvaluationInput;
  readonly summary: PhenoMaleEvaluationSummary;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Serialize the model's rating list into the DB `ratings` jsonb object
 * ({axisKey: score}). ONLY valid in-range integer scores are persisted — the
 * model never silently coerces an out-of-range value, and neither do we: an
 * invalid score is omitted (surfaced back to the grower as "not rated"), never
 * clamped or rounded into the record.
 */
export function serializeRatings(
  ratings: readonly PhenoMaleRatingInput[] | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ratings ?? []) {
    const key = cleanId(r?.key);
    if (!key) continue;
    if (isValidMaleScore(r?.score)) out[key] = r.score as number;
  }
  return out;
}

/**
 * Read the DB `ratings` jsonb back into the model's rating list. Non-object /
 * array payloads and non-numeric values are dropped defensively — the pure
 * model re-validates ranges, so a corrupt stored value surfaces as invalid
 * rather than crashing the read.
 */
export function deserializeRatings(raw: unknown): PhenoMaleRatingInput[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: PhenoMaleRatingInput[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number") out.push({ key, score: value });
  }
  return out;
}

/**
 * Save the grower's evaluation card for one male — one card per (hunt, plant),
 * or one per plant for a standalone (hunt-less) evaluation.
 *
 * hunt_id is nullable with two uniqueness rules (composite (hunt_id, plant_id)
 * + a partial unique index on plant_id WHERE hunt_id IS NULL), which PostgREST
 * upsert can't target with one onConflict clause — so this reads the existing
 * card and updates by id, or inserts. The incoming `ratings` REPLACE the stored
 * ratings for the card (the edit form owns the whole card, matching
 * upsertCandidateScore); see mergeRatingsForSave note below if per-axis merge
 * is ever wanted.
 */
export async function saveMaleEvaluation(input: {
  plantId: string;
  huntId?: string | null;
  strainLineage?: string | null;
  ratings?: readonly PhenoMaleRatingInput[] | null;
  note?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save this evaluation." };
  const plantId = cleanId(input.plantId);
  if (!plantId) return { ok: false, error: "Choose the male you're evaluating." };
  const huntId = cleanId(input.huntId) || null;

  const ratings = serializeRatings(input.ratings);
  const strainLineage = typeof input.strainLineage === "string" ? input.strainLineage.trim() : "";

  // Find an existing card for this exact (plant, hunt-or-null) pair.
  let lookup = phenoDb.from("pheno_male_evaluations").select("id").eq("plant_id", plantId);
  lookup = huntId ? lookup.eq("hunt_id", huntId) : lookup.is("hunt_id", null);
  const { data: existing, error: lookupError } = await lookup.limit(1);
  if (lookupError) return { ok: false, error: "Could not save this evaluation." };

  const existingId = Array.isArray(existing) && existing[0]?.id ? existing[0].id : null;

  if (existingId) {
    const { error } = await phenoDb
      .from("pheno_male_evaluations")
      .update({
        ratings,
        strain_lineage: strainLineage || null,
        note: input.note ?? null,
      })
      .eq("id", existingId);
    if (error) return { ok: false, error: "Could not save this evaluation." };
    return { ok: true, id: existingId };
  }

  const { data, error } = await phenoDb
    .from("pheno_male_evaluations")
    .insert({
      user_id: userId,
      hunt_id: huntId,
      plant_id: plantId,
      strain_lineage: strainLineage || null,
      ratings,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: "Could not save this evaluation." };
  return { ok: true, id: data.id };
}

/**
 * Record ONE pollen viability test for an evaluation (append-only). Viability
 * is a gate tracked separately from the taste rubric — a nonviable read on any
 * test flags the male regardless of vigor (see summarizePollenViability).
 *
 * germinationPct is optional 0..100 evidence; an out-of-range value is rejected
 * with a friendly error before the insert rather than surfacing the DB CHECK.
 * An unrecognized result normalizes to "untested" (matching the model), so a
 * blank test is still an honest recorded row, never a fabricated "viable".
 */
export async function recordPollenViabilityTest(input: {
  evaluationId: string;
  result?: PollenViabilityResult | string | null;
  germinationPct?: number | null;
  note?: string | null;
  testedAt?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to record a viability test." };
  const evaluationId = cleanId(input.evaluationId);
  if (!evaluationId) return { ok: false, error: "Save the male evaluation first." };

  let germinationPct: number | null = null;
  if (input.germinationPct !== null && input.germinationPct !== undefined) {
    const pct = input.germinationPct;
    if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, error: "Germination % must be between 0 and 100." };
    }
    germinationPct = pct;
  }

  const { data, error } = await phenoDb
    .from("pheno_pollen_viability_tests")
    .insert({
      user_id: userId,
      evaluation_id: evaluationId,
      result: normalizePollenViabilityResult(input.result),
      germination_pct: germinationPct,
      note: input.note ?? null,
      tested_at: input.testedAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) return { ok: false, error: "Could not record this viability test." };
  return { ok: true, id: data.id };
}

/** Viability tests recorded for an evaluation, most recent first. RLS-scoped. */
export async function listPollenViabilityTests(
  evaluationId: string,
): Promise<PollenViabilityTestRow[]> {
  const id = cleanId(evaluationId);
  if (!id) return [];
  const { data, error } = await phenoDb
    .from("pheno_pollen_viability_tests")
    .select("id, evaluation_id, result, germination_pct, note, tested_at, created_at")
    .eq("evaluation_id", id)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapViabilityRow);
}

function mapViabilityRow(r: {
  id: string;
  evaluation_id: string;
  result: string;
  germination_pct: number | null;
  note: string | null;
  tested_at: string | null;
  created_at: string;
}): PollenViabilityTestRow {
  return {
    id: r.id,
    evaluationId: r.evaluation_id,
    result: normalizePollenViabilityResult(r.result),
    germinationPct: r.germination_pct ?? null,
    note: r.note ?? null,
    testedAt: r.tested_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

/**
 * Load one male's evaluation card + its viability tests and compose the pure
 * model summary. Returns null when the grower has no card for this male yet.
 * A read failure throws PhenoEvidenceReadError so the UI shows an honest error
 * instead of a fabricated empty card (matching the editable-evidence surfaces).
 */
export async function getMaleEvaluation(
  ref: { plantId: string; huntId?: string | null; maleLabel?: string | null },
  axes?: readonly PhenoMaleEvaluationAxis[],
): Promise<LoadedMaleEvaluation | null> {
  const plantId = cleanId(ref.plantId);
  if (!plantId) return null;
  const huntId = cleanId(ref.huntId) || null;

  let query = phenoDb
    .from("pheno_male_evaluations")
    .select("id, hunt_id, plant_id, strain_lineage, ratings, note")
    .eq("plant_id", plantId);
  query = huntId ? query.eq("hunt_id", huntId) : query.is("hunt_id", null);
  const { data, error } = await query.limit(1);
  if (error) throw new PhenoEvidenceReadError("male_evaluations");
  const card = Array.isArray(data) && data[0] ? data[0] : null;
  if (!card?.id) return null;

  const tests = await listPollenViabilityTests(card.id);
  const input: PhenoMaleEvaluationInput = {
    maleId: plantId,
    maleLabel: ref.maleLabel ?? null,
    strainLineage: card.strain_lineage ?? null,
    ratings: deserializeRatings(card.ratings),
    // Oldest-first so the summary's Test 1 / Test 2 order matches the workbook
    // (listPollenViabilityTests returns most-recent-first).
    pollenViabilityTests: [...tests].reverse().map((t) => ({
      result: t.result,
      germinationPct: t.germinationPct,
      note: t.note,
    })),
  };

  return {
    evaluationId: card.id,
    input,
    summary: summarizeMaleEvaluation(input, axes ?? undefined),
  };
}

// Re-export the operator range for callers building rating inputs / UI bounds.
export { MIN_MALE_SCORE, MAX_MALE_SCORE };

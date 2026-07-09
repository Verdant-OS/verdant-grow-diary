/**
 * phenoScoreRoundsService — RLS-scoped read/write for staged / per-round
 * candidate scores (pheno_score_rounds). The same plant is scored at veg /
 * early_flower / mid_flower / late_flower / post_cure as SEPARATE comparable
 * rounds — one card per (hunt, plant, round).
 *
 * Same posture as phenoCandidateScoresService: a normal user-data write of the
 * grower's OWN observations, enforced by RLS (owner + owns hunt + owns plant +
 * candidate consistency). No service_role, no AI, no Action Queue, no
 * automation. Descriptive only — nothing here ranks or picks.
 */
import { supabase } from "@/integrations/supabase/client";
import { phenoDb } from "@/integrations/supabase/phenoTables";

export const PHENO_SCORE_ROUNDS = [
  "veg",
  "early_flower",
  "mid_flower",
  "late_flower",
  "post_cure",
] as const;
export type PhenoScoreRound = (typeof PHENO_SCORE_ROUNDS)[number];

export const PHENO_SCORE_ROUND_LABELS: Record<PhenoScoreRound, string> = {
  veg: "Veg",
  early_flower: "Early flower",
  mid_flower: "Mid flower",
  late_flower: "Late flower",
  post_cure: "Post-cure",
};

export function isPhenoScoreRound(value: unknown): value is PhenoScoreRound {
  return typeof value === "string" && (PHENO_SCORE_ROUNDS as readonly string[]).includes(value);
}

export interface ScoreRoundRow {
  readonly plantId: string;
  readonly round: PhenoScoreRound;
  readonly traits: Record<string, number>;
  readonly loudTraits: Record<string, number>;
  readonly aromaDescriptors: readonly string[];
  readonly noseNote: string | null;
  readonly note: string | null;
  readonly observedAt: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function objectOrEmpty(v: unknown): Record<string, number> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Upsert one round card for one candidate (one card per hunt+plant+round). */
export async function upsertScoreRound(input: {
  huntId: string;
  plantId: string;
  round: PhenoScoreRound;
  traits?: Record<string, number>;
  loudTraits?: Record<string, number>;
  aromaDescriptors?: readonly string[];
  noseNote?: string | null;
  note?: string | null;
  observedAt?: string | null;
}): Promise<SaveResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to save round scores." };
  if (!isPhenoScoreRound(input.round)) return { ok: false, error: "Unknown round." };
  const { error } = await phenoDb.from("pheno_score_rounds").upsert(
    {
      user_id: userId,
      hunt_id: input.huntId,
      plant_id: input.plantId,
      round: input.round,
      traits: input.traits ?? {},
      loud_traits: input.loudTraits ?? {},
      aroma_descriptors: [...(input.aromaDescriptors ?? [])],
      nose_note: input.noseNote ?? null,
      note: input.note ?? null,
      observed_at: input.observedAt ?? new Date().toISOString(),
    },
    { onConflict: "hunt_id,plant_id,round" },
  );
  if (error) return { ok: false, error: "Could not save this round." };
  return { ok: true };
}

/**
 * Load round cards for a hunt, keyed "plantId:round". RLS-scoped read.
 *
 * Pass `round` to fetch a single round's cards — the workspace shows one
 * round at a time, and all-rounds-at-once is candidates × 5 rows (1,500 at
 * 300 candidates), enough to cross PostgREST's silent default row ceiling.
 * The explicit limit turns any residual truncation deterministic instead of
 * server-configuration-dependent.
 */
export async function listScoreRoundsForHunt(
  huntId: string,
  round?: PhenoScoreRound,
): Promise<Record<string, ScoreRoundRow>> {
  const id = typeof huntId === "string" ? huntId.trim() : "";
  if (!id) return {};
  let query = phenoDb
    .from("pheno_score_rounds")
    .select("plant_id, round, traits, loud_traits, aroma_descriptors, nose_note, note, observed_at")
    .eq("hunt_id", id);
  if (round && isPhenoScoreRound(round)) query = query.eq("round", round);
  const { data, error } = await query.limit(1000);
  if (error || !data) return {};
  const map: Record<string, ScoreRoundRow> = {};
  for (const row of data) {
    if (!row.plant_id || !isPhenoScoreRound(row.round)) continue;
    map[`${row.plant_id}:${row.round}`] = {
      plantId: row.plant_id,
      round: row.round,
      traits: objectOrEmpty(row.traits),
      loudTraits: objectOrEmpty(row.loud_traits),
      aromaDescriptors: stringArray(row.aroma_descriptors),
      noseNote: row.nose_note ?? null,
      note: row.note ?? null,
      observedAt: row.observed_at ?? null,
    };
  }
  return map;
}

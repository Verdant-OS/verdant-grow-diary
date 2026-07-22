/**
 * phenoScorecardRules — pure rules for the Pheno Comparison scorecard.
 *
 * A candidate score is a grower's SUBJECTIVE 1-5 rating per phenotype trait,
 * stored in pheno_candidate_scores.traits (jsonb keyed by trait). This module
 * validates/normalizes those ratings and bridges the stored shape into the
 * comparison engine's PhenotypeInput so real ratings replace "Not recorded".
 *
 * Hard constraints:
 *   - Pure & deterministic. No I/O, no React, no Supabase.
 *   - Never invents a rating; out-of-range / non-1-5 values are dropped, not
 *     clamped, so a bad value reads as "not rated" rather than a fake score.
 *   - Verdant never ranks candidates or picks a keeper — this only records and
 *     echoes what the grower entered.
 */
import {
  PHENOTYPE_TRAIT_KEYS,
  PHENOTYPE_TRAIT_LABELS,
  type PhenotypeInput,
  type PhenotypeTraitKey,
} from "@/lib/phenoSelectionRules";

export const PHENO_SCORE_MIN = 1;
export const PHENO_SCORE_MAX = 5;

/** Ordered trait list for the scoring form (core traits first). */
export const PHENO_SCORECARD_TRAITS: ReadonlyArray<{
  key: PhenotypeTraitKey;
  label: string;
}> = PHENOTYPE_TRAIT_KEYS.map((key) => ({
  key,
  label: PHENOTYPE_TRAIT_LABELS[key],
}));

/** A single trait rating: an integer in [1,5], or null when not rated. */
export type PhenoTraitRating = number | null;

/** In-form / persisted rating map keyed by trait. */
export type PhenoScoreTraits = Partial<Record<PhenotypeTraitKey, PhenoTraitRating>>;

/** True when v is an integer 1-5. Strings that look numeric are accepted. */
export function isValidTraitRating(v: unknown): v is number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= PHENO_SCORE_MIN && n <= PHENO_SCORE_MAX;
}

/**
 * Normalize a raw traits jsonb blob (unknown shape) into a clean rating map.
 * Unknown keys and invalid values are dropped — never clamped or faked.
 */
export function normalizeScoreTraits(raw: unknown): PhenoScoreTraits {
  const out: PhenoScoreTraits = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const key of PHENOTYPE_TRAIT_KEYS) {
    const v = src[key];
    if (isValidTraitRating(v)) out[key] = Number(v);
  }
  return out;
}

/** Count of rated traits in a normalized (or raw) map. */
export function countRatedTraits(traits: unknown): number {
  const norm = normalizeScoreTraits(traits);
  return PHENOTYPE_TRAIT_KEYS.reduce(
    (n, key) => n + (typeof norm[key] === "number" ? 1 : 0),
    0,
  );
}

/**
 * Build the jsonb payload to persist. Only valid ratings are included, so a
 * blank/invalid field is stored as absent (not 0, not null).
 */
export function buildScoreTraitsPayload(
  traits: PhenoScoreTraits,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of PHENOTYPE_TRAIT_KEYS) {
    const v = traits[key];
    if (isValidTraitRating(v)) out[key] = Number(v);
  }
  return out;
}

/**
 * Bridge a stored traits blob into the comparison engine's PhenotypeInput.
 * Each rated trait becomes `{ value: <1-5> }`; unrated traits are omitted so
 * the engine renders its honest "Not recorded" cell + evidence-gap caveats.
 */
export function phenotypeInputFromScoreTraits(raw: unknown): PhenotypeInput {
  const norm = normalizeScoreTraits(raw);
  const out: PhenotypeInput = {};
  for (const key of PHENOTYPE_TRAIT_KEYS) {
    const v = norm[key];
    if (typeof v === "number") out[key] = { value: v };
  }
  return out;
}

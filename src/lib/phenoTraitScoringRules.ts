/**
 * phenoTraitScoringRules
 *
 * Pure rules for grower-entered SUBJECTIVE 1-5 trait ratings of pheno hunt
 * candidates. Descriptive only:
 *
 *  - We summarize each candidate's OWN ratings (which traits were rated, the
 *    average, how complete the card is, what's still missing).
 *  - We NEVER compare candidates against each other, order them by score, or
 *    name a "best" one. Verdant does not pick a phenotype for the grower.
 *  - Ratings are the grower's opinions, not measurements. Out-of-range or
 *    non-integer values are surfaced as invalid, never silently coerced.
 *
 * No I/O. No fetch. No Supabase. No AI. No writes. Deterministic, null-safe.
 */

/** Valid subjective rating range, inclusive. */
export const MIN_TRAIT_SCORE = 1;
export const MAX_TRAIT_SCORE = 5;

export interface PhenoTraitDefinition {
  readonly key: string;
  readonly label: string;
}

/**
 * A default hybrid trait set. This is a STARTING POINT, deliberately small and
 * easy to change — the trait taxonomy is a product decision still open for
 * review, so the rules below are taxonomy-agnostic and accept any trait set.
 */
export const DEFAULT_HYBRID_TRAITS: readonly PhenoTraitDefinition[] = [
  { key: "vigor", label: "Vigor" },
  { key: "structure", label: "Structure" },
  { key: "aroma", label: "Aroma" },
  { key: "flavor", label: "Flavor" },
  { key: "potency_impression", label: "Potency (impression)" },
  { key: "yield_impression", label: "Yield (impression)" },
  { key: "bag_appeal", label: "Bag appeal" },
  { key: "resilience", label: "Resilience" },
];

export interface PhenoTraitRatingInput {
  readonly key: string;
  /** Expected integer 1..5. Anything else is reported as invalid, not used. */
  readonly score?: number | null;
  readonly note?: string | null;
}

export interface PhenoCandidateTraitInput {
  readonly candidateId: string;
  readonly candidateLabel?: string | null;
  readonly ratings?: readonly PhenoTraitRatingInput[] | null;
}

export interface PhenoRatedTrait {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly note: string | null;
}

export interface PhenoMissingTrait {
  readonly key: string;
  readonly label: string;
}

export interface PhenoCandidateTraitSummary {
  readonly candidateId: string;
  readonly candidateLabel: string;
  /** Valid ratings for traits in the active set, in trait-set order. */
  readonly ratedTraits: readonly PhenoRatedTrait[];
  readonly ratedCount: number;
  readonly totalTraits: number;
  /** ratedCount / totalTraits, 0..1. 0 when the trait set is empty. */
  readonly completeness: number;
  /** Mean of the valid ratings, or null when nothing valid was rated. */
  readonly averageScore: number | null;
  /** Traits in the active set with no valid rating yet. */
  readonly missingTraits: readonly PhenoMissingTrait[];
  /** Rated keys whose score was out of range / non-integer (surfaced, not used). */
  readonly invalidRatingKeys: readonly string[];
  /** Rated keys not present in the active trait set (surfaced, not used). */
  readonly unknownRatingKeys: readonly string[];
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** True only for an integer within [MIN_TRAIT_SCORE, MAX_TRAIT_SCORE]. */
export function isValidTraitScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TRAIT_SCORE &&
    value <= MAX_TRAIT_SCORE
  );
}

/**
 * Convert a stored jsonb trait record ({ "vigor": 4, "aroma": 5 }) into rating
 * inputs. Non-object input yields an empty list. Values are passed through
 * untouched so invalid entries can be reported downstream.
 */
export function traitRecordToRatings(record: unknown): PhenoTraitRatingInput[] {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  const out: PhenoTraitRatingInput[] = [];
  for (const [key, raw] of Object.entries(record as Record<string, unknown>)) {
    const k = cleanString(key);
    if (!k) continue;
    out.push({ key: k, score: typeof raw === "number" ? raw : null });
  }
  return out;
}

/**
 * Summarize ONE candidate's trait card against the active trait set. Purely
 * descriptive — no comparison to other candidates.
 */
export function summarizeCandidateTraitScores(
  input: PhenoCandidateTraitInput,
  traits: readonly PhenoTraitDefinition[] = DEFAULT_HYBRID_TRAITS,
): PhenoCandidateTraitSummary {
  const candidateId = input.candidateId;
  const candidateLabel = cleanString(input.candidateLabel) ?? candidateId;

  // Index the caller's ratings by trait key; later duplicates overwrite earlier.
  const ratingByKey = new Map<string, PhenoTraitRatingInput>();
  for (const r of input.ratings ?? []) {
    const k = cleanString(r?.key);
    if (k) ratingByKey.set(k, r);
  }

  const activeKeys = new Set<string>();
  const ratedTraits: PhenoRatedTrait[] = [];
  const missingTraits: PhenoMissingTrait[] = [];
  const invalidRatingKeys: string[] = [];

  for (const def of traits) {
    const key = cleanString(def.key);
    if (!key || activeKeys.has(key)) continue; // ignore blank/duplicate defs
    activeKeys.add(key);
    const label = cleanString(def.label) ?? key;
    const rating = ratingByKey.get(key);

    if (!rating || rating.score === null || rating.score === undefined) {
      missingTraits.push({ key, label });
      continue;
    }
    if (!isValidTraitScore(rating.score)) {
      invalidRatingKeys.push(key);
      missingTraits.push({ key, label });
      continue;
    }
    ratedTraits.push({ key, label, score: rating.score, note: cleanString(rating.note) });
  }

  // Rated keys that aren't part of the active trait set — surfaced, never scored.
  const unknownRatingKeys: string[] = [];
  for (const k of ratingByKey.keys()) {
    if (!activeKeys.has(k)) unknownRatingKeys.push(k);
  }
  unknownRatingKeys.sort();

  const totalTraits = activeKeys.size;
  const ratedCount = ratedTraits.length;
  const completeness = totalTraits > 0 ? ratedCount / totalTraits : 0;
  const averageScore =
    ratedCount > 0 ? ratedTraits.reduce((sum, t) => sum + t.score, 0) / ratedCount : null;

  return {
    candidateId,
    candidateLabel,
    ratedTraits,
    ratedCount,
    totalTraits,
    completeness,
    averageScore,
    missingTraits,
    invalidRatingKeys,
    unknownRatingKeys,
  };
}

/**
 * Summarize a set of candidates. Order is preserved from the input (NOT sorted
 * by score) — this surface never ranks candidates.
 */
export function summarizeTraitScores(
  inputs: readonly PhenoCandidateTraitInput[] | null | undefined,
  traits: readonly PhenoTraitDefinition[] = DEFAULT_HYBRID_TRAITS,
): PhenoCandidateTraitSummary[] {
  const list = Array.isArray(inputs) ? inputs : [];
  return list
    .filter((c) => c && typeof c.candidateId === "string" && c.candidateId.length > 0)
    .map((c) => summarizeCandidateTraitScores(c, traits));
}

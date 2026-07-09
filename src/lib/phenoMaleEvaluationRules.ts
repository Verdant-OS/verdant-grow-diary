/**
 * phenoMaleEvaluationRules
 *
 * Pure rules for grower-entered male evaluation cards, mirroring the
 * Advanced Phenotype Hunter Workbook v1.1 "Male_Evaluation_Tracker" sheet.
 * Males are half the genetics of every cross, but the pheno-hunt surface so
 * far scores the female lifecycle; this module summarizes a single male's
 * OWN evaluation card. It is descriptive only:
 *
 *  - We summarize each male's OWN 1-10 rubric ratings (which axes were rated,
 *    the average, how complete the card is, what's still missing).
 *  - Pollen viability is tracked SEPARATELY from the 1-10 rubric, because a
 *    male with nonviable pollen cannot breed regardless of vigor. Two
 *    independent tests are summarized into a descriptive readiness status.
 *  - We NEVER compare males against each other, order them by score, name a
 *    "best" one, or emit a keep/cull/promotion decision. Verdant does not pick
 *    a male for the grower — the workbook's "Promotion Decision" stays an
 *    operator choice.
 *  - Ratings are the grower's opinions, not measurements. Out-of-range or
 *    non-integer values are surfaced as invalid, never silently coerced.
 *
 * No I/O. No fetch. No Supabase. No AI. No writes. Deterministic, null-safe.
 */

export const PHENO_MALE_EVALUATION_CAVEAT =
  "Operator-scored preview. No writes, no automation, no device control. Verdant does not pick or promote a male for you.";

/** Valid operator rubric range for male axes, inclusive (workbook uses 1-10). */
export const MIN_MALE_SCORE = 1;
export const MAX_MALE_SCORE = 10;

export interface PhenoMaleEvaluationAxis {
  readonly key: string;
  readonly label: string;
}

/**
 * The default male evaluation axes from the v1.1 workbook's
 * Male_Evaluation_Tracker (the 1-10 operator rubrics only — pollen viability
 * is modelled separately below). This is a STARTING POINT: the rules are
 * axis-set-agnostic and accept any axis set, so the taxonomy stays a product
 * decision open for review.
 */
export const DEFAULT_MALE_EVALUATION_AXES: readonly PhenoMaleEvaluationAxis[] = [
  { key: "vegetative_vigor_structure", label: "Vegetative vigor & structure" },
  { key: "early_terp_projection", label: "Early terp projection (stem/leaf rub)" },
  { key: "pollen_sac_density_timing", label: "Pollen sac density & timing" },
  { key: "glandular_expression", label: "Glandular expression on male flowers" },
  { key: "environmental_robustness", label: "Environmental robustness" },
  { key: "progeny_potential", label: "Progeny potential (from test crosses)" },
];

export interface PhenoMaleRatingInput {
  readonly key: string;
  /** Expected integer 1..10. Anything else is reported as invalid, not used. */
  readonly score?: number | null;
  readonly note?: string | null;
}

/**
 * A single pollen viability test result. Germination % is optional evidence;
 * `result` is the operator's read. Deliberately NOT a 1-10 rubric — viability
 * is a gate, not a taste score.
 */
export type PollenViabilityResult = "viable" | "nonviable" | "inconclusive" | "untested";

export interface PollenViabilityTestInput {
  readonly result?: PollenViabilityResult | null;
  /** Optional germination percentage evidence, 0..100. Surfaced, never scored. */
  readonly germinationPct?: number | null;
  readonly note?: string | null;
}

export interface PhenoMaleEvaluationInput {
  readonly maleId: string;
  readonly maleLabel?: string | null;
  readonly strainLineage?: string | null;
  readonly ratings?: readonly PhenoMaleRatingInput[] | null;
  /** Two independent viability tests, per the workbook (Test 1 / Test 2). */
  readonly pollenViabilityTests?: readonly PollenViabilityTestInput[] | null;
}

export interface PhenoRatedMaleAxis {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly note: string | null;
}

export interface PhenoMissingMaleAxis {
  readonly key: string;
  readonly label: string;
}

/**
 * Descriptive readiness derived from the two viability tests — a factual
 * rollup of what the operator recorded, NOT a keep/cull recommendation.
 *
 *  - "confirmed": both recorded tests read viable.
 *  - "flagged_nonviable": at least one test read nonviable (a hard concern).
 *  - "partial": one viable read, no nonviable read, second test not viable yet.
 *  - "untested": no viable/nonviable/inconclusive read recorded.
 */
export type PollenViabilityStatus = "confirmed" | "partial" | "flagged_nonviable" | "untested";

export interface PhenoPollenViabilitySummary {
  /** Normalized results in input order (missing/blank tests → "untested"). */
  readonly results: readonly PollenViabilityResult[];
  /** Count of tests with a non-"untested" read recorded (0..n). */
  readonly recordedCount: number;
  readonly viableCount: number;
  readonly nonviableCount: number;
  readonly status: PollenViabilityStatus;
}

export interface PhenoMaleEvaluationSummary {
  readonly maleId: string;
  readonly maleLabel: string;
  readonly strainLineage: string | null;
  /** Valid ratings for axes in the active set, in axis-set order. */
  readonly ratedAxes: readonly PhenoRatedMaleAxis[];
  readonly ratedCount: number;
  readonly totalAxes: number;
  /** ratedCount / totalAxes, 0..1. 0 when the axis set is empty. */
  readonly completeness: number;
  /** Mean of the valid ratings, or null when nothing valid was rated. */
  readonly averageScore: number | null;
  /** Axes in the active set with no valid rating yet. */
  readonly missingAxes: readonly PhenoMissingMaleAxis[];
  /** Rated keys whose score was out of range / non-integer (surfaced, not used). */
  readonly invalidRatingKeys: readonly string[];
  /** Rated keys not present in the active axis set (surfaced, not used). */
  readonly unknownRatingKeys: readonly string[];
  /** Separate, gate-relevant pollen viability rollup. */
  readonly pollenViability: PhenoPollenViabilitySummary;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** True only for an integer within [MIN_MALE_SCORE, MAX_MALE_SCORE]. */
export function isValidMaleScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_MALE_SCORE &&
    value <= MAX_MALE_SCORE
  );
}

const VIABILITY_RESULTS: ReadonlySet<PollenViabilityResult> = new Set([
  "viable",
  "nonviable",
  "inconclusive",
  "untested",
]);

/** Normalize an unknown value to a PollenViabilityResult; unknown → "untested". */
export function normalizePollenViabilityResult(value: unknown): PollenViabilityResult {
  return typeof value === "string" && VIABILITY_RESULTS.has(value as PollenViabilityResult)
    ? (value as PollenViabilityResult)
    : "untested";
}

/**
 * Roll two (or more) independent viability tests into a descriptive status.
 * Precedence: any nonviable read is a flag; otherwise both-viable is confirmed;
 * a single viable read is partial; nothing recorded is untested.
 */
export function summarizePollenViability(
  tests: readonly PollenViabilityTestInput[] | null | undefined,
): PhenoPollenViabilitySummary {
  const list = Array.isArray(tests) ? tests : [];
  const results = list.map((t) => normalizePollenViabilityResult(t?.result));
  const recordedCount = results.filter((r) => r !== "untested").length;
  const viableCount = results.filter((r) => r === "viable").length;
  const nonviableCount = results.filter((r) => r === "nonviable").length;

  let status: PollenViabilityStatus;
  if (nonviableCount > 0) status = "flagged_nonviable";
  else if (viableCount >= 2) status = "confirmed";
  else if (viableCount === 1) status = "partial";
  else status = "untested";

  return { results, recordedCount, viableCount, nonviableCount, status };
}

/**
 * Summarize ONE male's evaluation card against the active axis set. Purely
 * descriptive — no comparison to other males, no promotion decision.
 */
export function summarizeMaleEvaluation(
  input: PhenoMaleEvaluationInput,
  axes: readonly PhenoMaleEvaluationAxis[] = DEFAULT_MALE_EVALUATION_AXES,
): PhenoMaleEvaluationSummary {
  const maleId = input.maleId;
  const maleLabel = cleanString(input.maleLabel) ?? maleId;
  const strainLineage = cleanString(input.strainLineage);

  // Index the caller's ratings by axis key; later duplicates overwrite earlier.
  const ratingByKey = new Map<string, PhenoMaleRatingInput>();
  for (const r of input.ratings ?? []) {
    const k = cleanString(r?.key);
    if (k) ratingByKey.set(k, r);
  }

  const activeKeys = new Set<string>();
  const ratedAxes: PhenoRatedMaleAxis[] = [];
  const missingAxes: PhenoMissingMaleAxis[] = [];
  const invalidRatingKeys: string[] = [];

  for (const def of axes) {
    const key = cleanString(def.key);
    if (!key || activeKeys.has(key)) continue; // ignore blank/duplicate defs
    activeKeys.add(key);
    const label = cleanString(def.label) ?? key;
    const rating = ratingByKey.get(key);

    if (!rating || rating.score === null || rating.score === undefined) {
      missingAxes.push({ key, label });
      continue;
    }
    if (!isValidMaleScore(rating.score)) {
      invalidRatingKeys.push(key);
      missingAxes.push({ key, label });
      continue;
    }
    ratedAxes.push({ key, label, score: rating.score, note: cleanString(rating.note) });
  }

  // Rated keys that aren't part of the active axis set — surfaced, never scored.
  const unknownRatingKeys: string[] = [];
  for (const k of ratingByKey.keys()) {
    if (!activeKeys.has(k)) unknownRatingKeys.push(k);
  }
  unknownRatingKeys.sort();

  const totalAxes = activeKeys.size;
  const ratedCount = ratedAxes.length;
  const completeness = totalAxes > 0 ? ratedCount / totalAxes : 0;
  const averageScore =
    ratedCount > 0 ? ratedAxes.reduce((sum, a) => sum + a.score, 0) / ratedCount : null;

  return {
    maleId,
    maleLabel,
    strainLineage,
    ratedAxes,
    ratedCount,
    totalAxes,
    completeness,
    averageScore,
    missingAxes,
    invalidRatingKeys,
    unknownRatingKeys,
    pollenViability: summarizePollenViability(input.pollenViabilityTests),
  };
}

/**
 * Summarize a set of males. Order is preserved from the input (NOT sorted by
 * score) — this surface never ranks males.
 */
export function summarizeMaleEvaluations(
  inputs: readonly PhenoMaleEvaluationInput[] | null | undefined,
  axes: readonly PhenoMaleEvaluationAxis[] = DEFAULT_MALE_EVALUATION_AXES,
): PhenoMaleEvaluationSummary[] {
  const list = Array.isArray(inputs) ? inputs : [];
  return list
    .filter((m) => m && typeof m.maleId === "string" && m.maleId.length > 0)
    .map((m) => summarizeMaleEvaluation(m, axes));
}

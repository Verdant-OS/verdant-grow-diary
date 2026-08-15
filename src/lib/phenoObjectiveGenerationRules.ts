/**
 * phenoObjectiveGenerationRules — pure "did the line move toward the bar?"
 * model across a chain of pheno hunts.
 *
 * THE QUESTION THIS ANSWERS: a breeder running a line does not ask "which
 * plant is best" — they ask whether THIS generation is landing closer to the
 * objective they set than the last one did. Every piece needed for that
 * already exists (per-hunt breeding objectives, recorded candidate traits,
 * hunt-wide coverage counts); what was missing is the link between hunts and
 * an honest way to read the trend.
 *
 * WHAT IT REPORTS, AND WHAT IT REFUSES TO:
 *  - Per generation, per axis: how many candidates were SCORED on that axis
 *    and how many MET the bar. Counts and a share, nothing else.
 *  - It never orders candidates, never names one, and never reaches inside a
 *    generation to compare plants — it composes only the hunt-wide COUNTS
 *    from summarizeHuntObjectiveCoverage, which is itself counts-only.
 *  - A share that rose between generations is described as "a larger share
 *    met the bar", never as proof the line improved, and never as a forecast.
 *    Selection, environment, and cohort size all move that number; this module
 *    knows none of them and claims none of them.
 *  - A generation with nothing scored on an axis reads as "not yet scored",
 *    never as 0% met — absent evidence is never a failure.
 *  - Generations are compared only on axes BOTH actually scored. An axis the
 *    earlier hunt never scored yields no trend, rather than a false jump.
 *
 * PURE: no I/O, no Supabase, no React, no fetch, no AI, no randomness, no
 * module-level clock. Deterministic and null-safe.
 */

import { LOUD_TRAIT_AXES, type PhenoTraitAxis } from "@/lib/phenoExpressionRules";
import {
  summarizeCandidateObjective,
  type BreedingObjectiveTarget,
} from "@/lib/phenoBreedingObjectiveRules";

const AXIS_BY_KEY: ReadonlyMap<string, PhenoTraitAxis> = new Map(
  LOUD_TRAIT_AXES.map((a) => [a.key, a]),
);

/** Hard ceiling on how far back a lineage walk will follow parents. */
export const MAX_GENERATION_CHAIN = 8;

export interface GenerationHuntInput {
  readonly huntId: string;
  readonly huntName: string;
  /** The grower's free-text generation label (F1, F2, BX1…), if they set one. */
  readonly generationLabel: string | null;
  readonly parentHuntId: string | null;
  readonly targets: readonly BreedingObjectiveTarget[];
  /** One entry per candidate in this hunt, with that candidate's own traits. */
  readonly candidates: readonly { readonly traits: Readonly<Record<string, number>> | null }[];
}

export interface GenerationAxisResult {
  readonly axisKey: string;
  readonly axisLabel: string;
  readonly threshold: number;
  readonly comparator: "gte" | "lte";
  /** Candidates in this hunt with a recorded value on this axis. */
  readonly scoredCount: number;
  /** Of those scored, how many met the bar. */
  readonly metCount: number;
  /** metCount / scoredCount, or null when nothing was scored. */
  readonly metShare: number | null;
}

export interface GenerationResult {
  readonly huntId: string;
  readonly huntName: string;
  readonly generationLabel: string | null;
  readonly candidateCount: number;
  readonly axes: readonly GenerationAxisResult[];
}

export type AxisTrendDirection = "larger_share" | "smaller_share" | "unchanged" | "not_comparable";

export interface AxisTrend {
  readonly axisKey: string;
  readonly axisLabel: string;
  readonly direction: AxisTrendDirection;
  readonly earlierShare: number | null;
  readonly latestShare: number | null;
  /** One honest sentence — descriptive, never causal or predictive. */
  readonly detail: string;
}

export interface GenerationProgressModel {
  /** Oldest generation first. Empty when nothing was resolvable. */
  readonly generations: readonly GenerationResult[];
  /** Trend between the EARLIEST and LATEST generation, per shared axis. */
  readonly trends: readonly AxisTrend[];
  /** True when at least two generations carry comparable evidence. */
  readonly comparable: boolean;
}

/**
 * Walk a hunt's parent chain into an oldest-first ordered list.
 *
 * Bounded by MAX_GENERATION_CHAIN and guarded by a visited set: the database
 * can only reject a hunt that is its own parent, so a longer ring (A→B→A) has
 * to be broken here rather than looping forever.
 */
export function buildGenerationChain(
  leafHuntId: string,
  huntsById: Readonly<Record<string, GenerationHuntInput>>,
): GenerationHuntInput[] {
  const byId = huntsById ?? {};
  const chain: GenerationHuntInput[] = [];
  const visited = new Set<string>();
  let currentId: string | null = typeof leafHuntId === "string" ? leafHuntId : null;

  while (currentId && chain.length < MAX_GENERATION_CHAIN) {
    if (visited.has(currentId)) break; // cycle — stop rather than spin
    visited.add(currentId);
    const hunt: GenerationHuntInput | undefined = byId[currentId];
    if (!hunt) break;
    chain.push(hunt);
    currentId =
      typeof hunt.parentHuntId === "string" && hunt.parentHuntId ? hunt.parentHuntId : null;
  }

  return chain.reverse(); // oldest generation first
}

/** Per-axis scored/met counts for ONE hunt, composed from counts only. */
function axisResultsFor(hunt: GenerationHuntInput): GenerationAxisResult[] {
  const targets = Array.isArray(hunt.targets) ? hunt.targets : [];
  const candidates = Array.isArray(hunt.candidates) ? hunt.candidates : [];
  return targets.map((t) => {
    let scoredCount = 0;
    let metCount = 0;
    for (const c of candidates) {
      // Reuse the single-candidate evaluator so this module never invents a
      // second, divergent notion of "meets the bar".
      const summary = summarizeCandidateObjective([t], c?.traits ?? null);
      const evaluation = summary.evaluations[0];
      if (!evaluation || evaluation.actualValue === null) continue;
      scoredCount += 1;
      if (evaluation.met === true) metCount += 1;
    }
    return {
      axisKey: t.axisKey,
      axisLabel: AXIS_BY_KEY.get(t.axisKey)?.label ?? t.axisKey,
      threshold: t.threshold,
      comparator: t.comparator,
      scoredCount,
      metCount,
      metShare: scoredCount === 0 ? null : metCount / scoredCount,
    };
  });
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function trendDetail(
  axisLabel: string,
  earlier: GenerationAxisResult | undefined,
  latest: GenerationAxisResult | undefined,
): { direction: AxisTrendDirection; detail: string } {
  if (!earlier || !latest || earlier.metShare === null || latest.metShare === null) {
    return {
      direction: "not_comparable",
      detail: `${axisLabel}: not enough scored candidates in both generations to compare.`,
    };
  }
  const e = earlier.metShare;
  const l = latest.metShare;
  const shared = `${pct(l)} of the ${latest.scoredCount} scored this generation met your bar, against ${pct(e)} of ${earlier.scoredCount} before`;
  if (l > e) {
    return {
      direction: "larger_share",
      detail: `${axisLabel}: ${shared}. A larger share met the bar — that is what you recorded, not proof the line improved.`,
    };
  }
  if (l < e) {
    return {
      direction: "smaller_share",
      detail: `${axisLabel}: ${shared}. A smaller share met the bar this time.`,
    };
  }
  return {
    direction: "unchanged",
    detail: `${axisLabel}: ${shared}. The share that met the bar is unchanged.`,
  };
}

/**
 * Build the cross-generation progress model from an oldest-first chain.
 * Trends compare the FIRST and LAST generation on axes both actually scored.
 */
export function buildGenerationProgress(
  chain: readonly GenerationHuntInput[],
): GenerationProgressModel {
  const list = Array.isArray(chain) ? chain.filter((h) => h && typeof h.huntId === "string") : [];
  const generations: GenerationResult[] = list.map((h) => ({
    huntId: h.huntId,
    huntName:
      typeof h.huntName === "string" && h.huntName.trim() !== "" ? h.huntName : "Untitled hunt",
    generationLabel:
      typeof h.generationLabel === "string" && h.generationLabel.trim() !== ""
        ? h.generationLabel.trim()
        : null,
    candidateCount: Array.isArray(h.candidates) ? h.candidates.length : 0,
    axes: axisResultsFor(h),
  }));

  if (generations.length < 2) {
    return { generations, trends: [], comparable: false };
  }

  const earliest = generations[0];
  const latest = generations[generations.length - 1];
  const earlierByAxis = new Map(earliest.axes.map((a) => [a.axisKey, a]));

  // Only axes the LATEST generation targets can trend; an axis the earlier
  // hunt never scored yields "not comparable" rather than a false jump.
  const trends: AxisTrend[] = latest.axes.map((a) => {
    const earlier = earlierByAxis.get(a.axisKey);
    const { direction, detail } = trendDetail(a.axisLabel, earlier, a);
    return {
      axisKey: a.axisKey,
      axisLabel: a.axisLabel,
      direction,
      earlierShare: earlier?.metShare ?? null,
      latestShare: a.metShare,
      detail,
    };
  });

  return {
    generations,
    trends,
    comparable: trends.some((t) => t.direction !== "not_comparable"),
  };
}

export const GENERATION_PROGRESS_CAVEAT =
  "This counts how many candidates in each generation met the bar you set for that hunt. Selection, cohort size, and growing conditions all move these numbers, so a shift is a description of what you recorded — never proof the line improved, and never a forecast of the next generation.";

export const GENERATION_PROGRESS_EMPTY_COPY =
  "Only one generation so far. Point a hunt at the earlier hunt it continues from to see how each generation landed against your objective.";

export const GENERATION_PROGRESS_NO_TARGETS_COPY =
  "No breeding objective set on this hunt yet. Define the targets you're selecting for, and each generation can be read against them.";

/**
 * phenoStabilityRunRules — pure "stability run" model for a Pheno Hunt keeper.
 *
 * THE IDEA: a phenotype selected from seed (an F1 keeper) is not confirmed
 * stable until its CLONE is grown again in a separate run and the traits
 * hold. This ledger records each grow-out of a keeper's clone with the
 * traits the grower observed that run, and reports whether they held
 * relative to the FIRST recorded run (the baseline).
 *
 * DELIBERATELY DISTINCT VOCABULARY: the word "replication" is already
 * spoken for elsewhere in the pheno code with two OTHER meanings —
 * within-run specimen count (formerly phenoSelectionRules.assessReplication;
 * that orphaned module has since been removed) and
 * "a backup clone is preserved" (the `replication_readiness` / clone
 * insurance evidence goal). This module is a THIRD, sequential concept:
 * re-grow across cycles and see if traits hold. It uses "stability run"
 * throughout and reuses NEITHER of those ids nor the comparability grader
 * (which correctly treats a different grow as a confound for same-run
 * comparison — the opposite of what a re-run wants).
 *
 * HONESTY DOCTRINE (stricter than the rest of the pheno surface):
 *  - Never claims a phenotype is "stable", "proven", "guaranteed",
 *    "reproducible", or a "keeper". The strongest thing it ever says is
 *    "held across N grow-outs" — a description of the grower's own
 *    records, never a promise about future runs.
 *  - A single run is NEVER a confirmation ("stability is unconfirmed until
 *    a second run holds") — this extends the codebase's existing
 *    "single specimen — stability unknown" stance.
 *  - Traits are compared only against THIS keeper's own earlier run, never
 *    against other keepers or candidates.
 *  - The axis catalog is the existing LOUD_TRAIT_AXES — no invented metric.
 *
 * PURE: no I/O, no Supabase, no React, no fetch, no AI, no randomness, no
 * module-level clock. Deterministic and null-safe.
 */

import { LOUD_TRAIT_AXES, type PhenoTraitAxis } from "@/lib/phenoExpressionRules";

const AXIS_BY_KEY: ReadonlyMap<string, PhenoTraitAxis> = new Map(
  LOUD_TRAIT_AXES.map((a) => [a.key, a]),
);

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_STABILITY_RUNS = 12;
export const STABILITY_RUN_LABEL_MAX = 80;
export const STABILITY_RUN_NOTE_MAX = 500;
/** Bound on the stored provenance id (a uuid is 36 chars; this is a cap, not a format check). */
export const STABILITY_RUN_SOURCE_PLANT_ID_MAX = 64;
export const STABILITY_RUN_ENVIRONMENT_MAX = 80;

export interface StabilityRun {
  readonly runLabel: string;
  readonly observedAt: string | null;
  readonly traits: Readonly<Record<string, number>>;
  readonly note: string | null;
  /**
   * The plant this grow-out was observed on, when the grower linked one (see
   * phenoGrowOutHandoffRules). OPTIONAL and omitted entirely for hand-typed
   * runs, so a run recorded before linking existed stays byte-identical. Its
   * only job is provenance + de-duplication: a plant already carried into the
   * ledger is never proposed again. It never affects hold/drift evaluation.
   */
  readonly sourcePlantId?: string | null;
  /**
   * GROWER-ENTERED environment tag for this grow-out (e.g. "indoor coco,
   * summer" or a tent name). OPTIONAL and additive, like sourcePlantId. It is
   * always manual provenance — nothing auto-detects it — and it never affects
   * the hold/drift evaluation; it exists so a drift on re-grow can be READ
   * against the environment it happened in instead of being mistaken for
   * genetic instability, and it gates the environment comparison below.
   */
  readonly environment?: string | null;
}

/**
 * Validate a plain YYYY-MM-DD Gregorian calendar date without invoking the
 * host clock or timezone. This rejects impossible dates (including 1900-02-29)
 * while accepting leap days in years divisible by 400 (including 2000-02-29).
 */
export function isValidIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function sanitizeTraits(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const axis = AXIS_BY_KEY.get(key);
    if (!axis) continue;
    const v = typeof raw === "number" ? raw : NaN;
    if (!Number.isFinite(v) || v < axis.min || v > axis.max) continue;
    out[key] = v;
  }
  return out;
}

/**
 * Validate and normalize raw stability-run input.
 *  - Unknown trait axes and out-of-range values are dropped (never guessed
 *    or clamped).
 *  - runLabel is trimmed and required (a run with no label is dropped —
 *    the grower must be able to tell their runs apart).
 *  - observedAt keeps only a plain ISO calendar date; anything else → null.
 *  - Capped at MAX_STABILITY_RUNS, in input order (first = baseline).
 */
export function sanitizeStabilityRuns(
  input: readonly unknown[] | null | undefined,
): StabilityRun[] {
  if (!Array.isArray(input)) return [];
  const out: StabilityRun[] = [];
  for (const raw of input) {
    if (out.length >= MAX_STABILITY_RUNS) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const runLabel =
      typeof r.runLabel === "string" ? r.runLabel.trim().slice(0, STABILITY_RUN_LABEL_MAX) : "";
    if (runLabel === "") continue;
    const observedAtRaw = typeof r.observedAt === "string" ? r.observedAt.trim() : "";
    const observedAt = isValidIsoCalendarDate(observedAtRaw) ? observedAtRaw : null;
    const note =
      typeof r.note === "string" && r.note.trim() !== ""
        ? r.note.trim().slice(0, STABILITY_RUN_NOTE_MAX)
        : null;
    const run: StabilityRun = {
      runLabel,
      observedAt,
      traits: sanitizeTraits(r.traits),
      note,
    };
    // Provenance is ADDITIVE: only attach sourcePlantId / environment when
    // the stored row actually carries one, so a hand-typed run round-trips
    // unchanged rather than gaining null fields it never had.
    const sourcePlantId =
      typeof r.sourcePlantId === "string" && r.sourcePlantId.trim() !== ""
        ? r.sourcePlantId.trim().slice(0, STABILITY_RUN_SOURCE_PLANT_ID_MAX)
        : null;
    const environment =
      typeof r.environment === "string" && r.environment.trim() !== ""
        ? r.environment.trim().slice(0, STABILITY_RUN_ENVIRONMENT_MAX)
        : null;
    let next: StabilityRun = run;
    if (sourcePlantId !== null) next = { ...next, sourcePlantId };
    if (environment !== null) next = { ...next, environment };
    out.push(next);
  }
  return out;
}

/** Per-axis tolerance = 20% of the axis range, rounded (1 for 1-5, 2 for 0-10). */
function toleranceFor(axis: PhenoTraitAxis): number {
  return Math.max(1, Math.round((axis.max - axis.min) * 0.2));
}

export type StabilityVerdict = "no_runs" | "unconfirmed" | "holding" | "drifting";

export interface StabilityAxisTrend {
  readonly axisKey: string;
  readonly axisLabel: string;
  readonly baseline: number;
  /** Values in each subsequent run for this axis (null = not scored that run). */
  readonly laterValues: readonly (number | null)[];
  readonly tolerance: number;
  /** True when every later recorded value is within tolerance of the baseline. */
  readonly held: boolean;
  /** The largest absolute move from baseline across later runs, or 0. */
  readonly maxDrift: number;
}

export interface StabilityEvaluation {
  readonly verdict: StabilityVerdict;
  /** Runs that contain valid evidence comparable to the baseline. */
  readonly runCount: number;
  /** Every recorded run, including rows without baseline-comparable traits. */
  readonly recordedRunCount: number;
  readonly axisTrends: readonly StabilityAxisTrend[];
  /** Axis labels that drifted beyond tolerance — for the verdict copy. */
  readonly driftedAxes: readonly string[];
}

/**
 * Evaluate a keeper's stability from its ordered runs. The FIRST run is the
 * baseline; later runs are compared against it per shared axis. Never reads
 * any other keeper.
 */
export function evaluateStability(runs: readonly StabilityRun[]): StabilityEvaluation {
  const list = Array.isArray(runs) ? runs : [];
  if (list.length === 0) {
    return {
      verdict: "no_runs",
      runCount: 0,
      recordedRunCount: 0,
      axisTrends: [],
      driftedAxes: [],
    };
  }

  const baseline = list[0];
  const later = list.slice(1);
  const axisTrends: StabilityAxisTrend[] = [];
  const driftedAxes: string[] = [];

  // Defensive: a caller may (against the StabilityRun[] type, e.g. hand-built
  // or unsanitized input) pass a null run or a run with a null traits map.
  // Coerce to an empty trait map so a malformed element contributes no values
  // rather than throwing — keeping this module's "null-safe" contract true.
  const traitsOf = (run: StabilityRun | null | undefined): Readonly<Record<string, number>> =>
    run && typeof run.traits === "object" && run.traits !== null ? run.traits : {};

  const validValueFor = (
    traits: Readonly<Record<string, number>>,
    axis: PhenoTraitAxis,
  ): number | null => {
    const value = traits[axis.key];
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= axis.min &&
      value <= axis.max
      ? value
      : null;
  };

  const baseTraits = traitsOf(baseline);
  const baselineAxes = LOUD_TRAIT_AXES.filter((axis) => validValueFor(baseTraits, axis) !== null);
  const laterHasComparableEvidence = later.map((run) => {
    const traits = traitsOf(run);
    return baselineAxes.some((axis) => validValueFor(traits, axis) !== null);
  });
  const runCount =
    baselineAxes.length === 0
      ? 0
      : 1 + laterHasComparableEvidence.filter((hasEvidence) => hasEvidence).length;
  const recordedRunCount = list.length;

  if (list.length === 1) {
    return {
      verdict: "unconfirmed",
      runCount,
      recordedRunCount,
      axisTrends: [],
      driftedAxes: [],
    };
  }

  for (const axis of LOUD_TRAIT_AXES) {
    const base = validValueFor(baseTraits, axis);
    if (base === null) continue; // no valid baseline value → nothing to hold to
    const tolerance = toleranceFor(axis);
    const laterValues = later.map((run) => {
      return validValueFor(traitsOf(run), axis);
    });
    const recorded = laterValues.filter((v): v is number => v !== null);
    if (recorded.length === 0) continue; // never re-scored this axis → can't judge hold
    const maxDrift = recorded.reduce((m, v) => Math.max(m, Math.abs(v - base)), 0);
    const held = maxDrift <= tolerance;
    if (!held) driftedAxes.push(axis.label);
    axisTrends.push({
      axisKey: axis.key,
      axisLabel: axis.label,
      baseline: base,
      laterValues,
      tolerance,
      held,
      maxDrift,
    });
  }

  // With 2+ runs but no shared re-scored axis, we can't judge hold either way.
  if (axisTrends.length === 0) {
    return {
      verdict: "unconfirmed",
      runCount,
      recordedRunCount,
      axisTrends: [],
      driftedAxes: [],
    };
  }

  // Observed drift remains meaningful even if another run is incomplete. A
  // broad hold verdict is stricter: one SAME baseline trait must be comparable
  // in every later run. Run two scoring only trait A and run three scoring only
  // trait B cannot establish that either trait held across all three grow-outs.
  const hasFullyComparableAxis = axisTrends.some(
    (trend) => trend.held && trend.laterValues.every((value) => value !== null),
  );
  const verdict: StabilityVerdict =
    driftedAxes.length > 0 ? "drifting" : hasFullyComparableAxis ? "holding" : "unconfirmed";
  return { verdict, runCount, recordedRunCount, axisTrends, driftedAxes };
}

export const STABILITY_VERDICT_LABELS: Readonly<Record<StabilityVerdict, string>> = Object.freeze({
  no_runs: "No grow-outs recorded",
  unconfirmed: "Re-grow evidence incomplete",
  holding: "Held on re-grow",
  drifting: "Drifted on re-grow",
});

/**
 * A single honest line describing the keeper's standing. Never promises
 * future stability; the strongest claim is "held across N grow-outs".
 */
export function stabilityVerdictCopy(evalResult: StabilityEvaluation): string {
  switch (evalResult.verdict) {
    case "no_runs":
      return "No grow-outs recorded yet. Record a run to start tracking whether this phenotype holds.";
    case "unconfirmed":
      if (evalResult.recordedRunCount > 1 && evalResult.runCount < evalResult.recordedRunCount) {
        return `Only ${evalResult.runCount} of ${evalResult.recordedRunCount} recorded grow-outs include trait evidence comparable to the baseline. Only those evidence-bearing grow-outs count toward the stability comparison, and the incomplete evidence cannot support a held-across-runs claim yet.`;
      }
      if (evalResult.recordedRunCount > 1) {
        return `All ${evalResult.runCount} evidence-bearing grow-outs include some baseline-comparable evidence, but no single baseline trait was re-scored across every run. That incomplete comparison cannot support a held-across-runs claim yet.`;
      }
      return "Recorded once. Re-grow the clone in a separate run to see whether the traits hold — a single run can't tell you.";
    case "holding":
      return `At least one baseline trait held within tolerance across ${evalResult.runCount} evidence-bearing grow-outs, and no comparable observation drifted. That is what you observed so far, not a promise about future runs.`;
    case "drifting": {
      const which = evalResult.driftedAxes.join(", ");
      return `Traits shifted on re-grow (${which}). What you selected in run one did not repeat within your recorded tolerance.`;
    }
    default:
      return "";
  }
}

export const STABILITY_LEDGER_CAVEAT =
  "This shows how your own recorded traits held across the times you re-grew this clone. It is a record of what you saw, never a promise that the phenotype will hold again in a future run.";

export const STABILITY_LEDGER_EMPTY_COPY =
  "No grow-outs recorded yet. Add a run with the traits you observed to start the stability ledger.";

// ---------------------------------------------------------------------------
// Environment coverage — the gate in front of any environment comparison.
//
// A drift on re-grow can come from the phenotype OR from a different
// environment; without environment tags the two are indistinguishable. The
// comparison below is DESCRIPTIVE only (the grower's own observed values,
// grouped by their own environment tags) — no interaction statistics, no
// verdict. It requires at least GXE_MIN_TAGGED_RUNS environment-tagged
// grow-outs before it renders at all; below that, presenters show the
// insufficient-data copy naming exactly what is missing.
// ---------------------------------------------------------------------------

export const GXE_MIN_TAGGED_RUNS = 3;

export interface StabilityEnvironmentCoverage {
  readonly recordedRunCount: number;
  readonly taggedRunCount: number;
  /** Distinct environment tags, in first-seen order. */
  readonly environments: readonly string[];
  /** True when taggedRunCount >= GXE_MIN_TAGGED_RUNS AND 2+ distinct tags
   * exist — one environment repeated three times compares nothing. */
  readonly comparisonAvailable: boolean;
}

/** Identity key for an environment tag: "Tent A", "tent a" and "tent  A"
 * all describe one environment and must never unlock the comparison gate as
 * two. Display keeps the first-seen spelling; identity uses this key. */
export function canonicalEnvironmentTag(env: string): string {
  return env.trim().replace(/\s+/g, " ").toLowerCase();
}

export function summarizeEnvironmentCoverage(
  runs: readonly StabilityRun[] | null | undefined,
): StabilityEnvironmentCoverage {
  const list = Array.isArray(runs) ? runs : [];
  const displayByCanonical = new Map<string, string>();
  let taggedRunCount = 0;
  for (const run of list) {
    const env = typeof run?.environment === "string" ? run.environment.trim() : "";
    if (env === "") continue;
    taggedRunCount += 1;
    const key = canonicalEnvironmentTag(env);
    if (!displayByCanonical.has(key)) displayByCanonical.set(key, env);
  }
  const environments = [...displayByCanonical.values()];
  return {
    recordedRunCount: list.length,
    taggedRunCount,
    environments,
    comparisonAvailable: taggedRunCount >= GXE_MIN_TAGGED_RUNS && environments.length >= 2,
  };
}

/** Honest insufficient-data copy naming exactly what evidence is missing. */
export function environmentCoverageCopy(coverage: StabilityEnvironmentCoverage): string {
  if (coverage.comparisonAvailable) return "";
  if (coverage.recordedRunCount === 0) {
    return "No grow-outs recorded — the environment comparison needs at least three grow-outs with an environment tag, across at least two different environments.";
  }
  if (coverage.taggedRunCount < GXE_MIN_TAGGED_RUNS) {
    return `Environment tags recorded for ${coverage.taggedRunCount} of ${coverage.recordedRunCount} grow-outs. The environment comparison needs at least ${GXE_MIN_TAGGED_RUNS} tagged grow-outs (across at least two different environments) before observed differences can be read against the environment at all.`;
  }
  return `All ${coverage.taggedRunCount} tagged grow-outs share one environment ("${coverage.environments[0] ?? ""}") — with nothing to compare against, environment effects cannot be separated from the phenotype.`;
}

export interface EnvironmentAxisObservation {
  readonly environment: string;
  /** Observed values for this axis in that environment (recorded runs only). */
  readonly values: readonly number[];
}

export interface EnvironmentAxisComparison {
  readonly axisKey: string;
  readonly axisLabel: string;
  readonly byEnvironment: readonly EnvironmentAxisObservation[];
}

/**
 * Group the grower's own observed axis values by their own environment tags —
 * organizing, never concluding. Only axes observed in at least two different
 * environments appear (a single-environment axis compares nothing). Returns []
 * unless coverage meets the gate. Presenters must render the accompanying
 * caveat: observed differences may reflect the environment, the phenotype, or
 * both — a handful of grow-outs cannot separate them.
 */
export function buildEnvironmentComparison(
  runs: readonly StabilityRun[] | null | undefined,
): EnvironmentAxisComparison[] {
  const coverage = summarizeEnvironmentCoverage(runs);
  if (!coverage.comparisonAvailable) return [];
  const list = (Array.isArray(runs) ? runs : []).filter(
    (r) => typeof r?.environment === "string" && r.environment.trim() !== "",
  );
  const out: EnvironmentAxisComparison[] = [];
  for (const axis of LOUD_TRAIT_AXES) {
    // Grouped by canonical tag so case/whitespace variants pool together;
    // rendered under the coverage summary's first-seen display spelling.
    const byEnv = new Map<string, number[]>();
    for (const run of list) {
      const value = run.traits?.[axis.key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value < axis.min || value > axis.max) continue;
      const env = canonicalEnvironmentTag(run.environment as string);
      (byEnv.get(env) ?? byEnv.set(env, []).get(env)!).push(value);
    }
    if (byEnv.size < 2) continue;
    out.push({
      axisKey: axis.key,
      axisLabel: axis.label,
      byEnvironment: coverage.environments
        .filter((env) => byEnv.has(canonicalEnvironmentTag(env)))
        .map((env) => ({ environment: env, values: byEnv.get(canonicalEnvironmentTag(env))! })),
    });
  }
  return out;
}

export const ENVIRONMENT_COMPARISON_CAVEAT =
  "Observed values grouped by your own environment tags. Differences here may reflect the environment, the phenotype, or both — a handful of grow-outs cannot separate them, and this table never tries to.";

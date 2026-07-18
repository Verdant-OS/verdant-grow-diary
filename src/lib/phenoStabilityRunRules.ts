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
 * within-run specimen count (phenoSelectionRules.assessReplication) and
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_STABILITY_RUNS = 12;
export const STABILITY_RUN_LABEL_MAX = 80;
export const STABILITY_RUN_NOTE_MAX = 500;

export interface StabilityRun {
  readonly runLabel: string;
  readonly observedAt: string | null;
  readonly traits: Readonly<Record<string, number>>;
  readonly note: string | null;
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
    const runLabel = typeof r.runLabel === "string" ? r.runLabel.trim().slice(0, STABILITY_RUN_LABEL_MAX) : "";
    if (runLabel === "") continue;
    const observedAt =
      typeof r.observedAt === "string" && ISO_DATE_RE.test(r.observedAt.trim())
        ? r.observedAt.trim()
        : null;
    const note =
      typeof r.note === "string" && r.note.trim() !== ""
        ? r.note.trim().slice(0, STABILITY_RUN_NOTE_MAX)
        : null;
    out.push({ runLabel, observedAt, traits: sanitizeTraits(r.traits), note });
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
  readonly runCount: number;
  readonly axisTrends: readonly StabilityAxisTrend[];
  /** Axis labels that drifted beyond tolerance — for the verdict copy. */
  readonly driftedAxes: readonly string[];
}

/**
 * Evaluate a keeper's stability from its ordered runs. The FIRST run is the
 * baseline; later runs are compared against it per shared axis. Never reads
 * any other keeper.
 */
export function evaluateStability(
  runs: readonly StabilityRun[],
): StabilityEvaluation {
  const list = Array.isArray(runs) ? runs : [];
  if (list.length === 0) {
    return { verdict: "no_runs", runCount: 0, axisTrends: [], driftedAxes: [] };
  }
  if (list.length === 1) {
    return { verdict: "unconfirmed", runCount: 1, axisTrends: [], driftedAxes: [] };
  }

  const baseline = list[0];
  const later = list.slice(1);
  const axisTrends: StabilityAxisTrend[] = [];
  const driftedAxes: string[] = [];

  for (const axis of LOUD_TRAIT_AXES) {
    const base = baseline.traits[axis.key];
    if (typeof base !== "number") continue; // no baseline value → nothing to hold to
    const tolerance = toleranceFor(axis);
    const laterValues = later.map((run) => {
      const v = run.traits[axis.key];
      return typeof v === "number" ? v : null;
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
    return { verdict: "unconfirmed", runCount: list.length, axisTrends: [], driftedAxes: [] };
  }

  const verdict: StabilityVerdict = driftedAxes.length > 0 ? "drifting" : "holding";
  return { verdict, runCount: list.length, axisTrends, driftedAxes };
}

export const STABILITY_VERDICT_LABELS: Readonly<Record<StabilityVerdict, string>> = Object.freeze({
  no_runs: "No grow-outs recorded",
  unconfirmed: "Not yet re-grown",
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
      return "Recorded once. Re-grow the clone in a separate run to see whether the traits hold — a single run can't tell you.";
    case "holding":
      return `Traits held across ${evalResult.runCount} recorded grow-outs. That is what you observed so far, not a promise about future runs.`;
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

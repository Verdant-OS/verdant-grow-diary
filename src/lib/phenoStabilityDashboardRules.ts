/**
 * phenoStabilityDashboardRules — pure cross-keeper roll-up of the stability
 * ledger. Given every keeper the grower owns (across all their hunts) with its
 * recorded grow-outs, it evaluates EACH keeper against its OWN first run and
 * summarizes the spread — how many are holding, drifting, not-yet-re-grown, or
 * have no grow-outs recorded.
 *
 * NOT A LEADERBOARD: every keeper is judged only against its own baseline
 * (evaluateStability never reads another keeper), the entries are ordered
 * neutrally (by hunt then keeper name — structural, never by a quality score),
 * and the strongest thing any row can say is "held across N grow-outs". The
 * counts are descriptive aggregate stats, not a ranking of keepers against
 * each other.
 *
 * PURE: no I/O, no Supabase, no React, no clock, no randomness. Deterministic
 * and null-safe. Reuses evaluateStability + the verdict labels from
 * phenoStabilityRunRules — no second, divergent stability model.
 */

import {
  evaluateStability,
  STABILITY_VERDICT_LABELS,
  type StabilityRun,
  type StabilityVerdict,
} from "@/lib/phenoStabilityRunRules";

export interface StabilityDashboardKeeperInput {
  readonly keeperId: string;
  readonly keeperName: string;
  readonly huntId: string;
  readonly stabilityRuns: readonly StabilityRun[];
}

export interface StabilityDashboardEntry {
  readonly keeperId: string;
  readonly keeperName: string;
  readonly huntId: string;
  readonly huntName: string;
  readonly verdict: StabilityVerdict;
  readonly runCount: number;
  readonly driftedAxes: readonly string[];
  /** Neutral status label for the keeper's own verdict (never comparative). */
  readonly statusLabel: string;
  /** One honest descriptive line about this keeper's own runs. */
  readonly detail: string;
}

export interface StabilityDashboardModel {
  /** All keepers, ordered neutrally (hunt, then keeper name) — not by quality. */
  readonly entries: readonly StabilityDashboardEntry[];
  /** Aggregate stats: how many keepers fall in each verdict. Counts only. */
  readonly counts: Readonly<Record<StabilityVerdict, number>>;
  readonly totalKeepers: number;
  /** Keepers with at least one recorded grow-out (verdict !== no_runs). */
  readonly keepersWithRuns: number;
}

export const STABILITY_DASHBOARD_CAVEAT =
  "Each keeper is described only against its own first recorded run. This rolls up what you saw across your re-grows — it never orders your keepers against each other, and it is never a promise that a phenotype will hold again.";

export const STABILITY_DASHBOARD_EMPTY_COPY =
  "No keepers yet. Name a keeper in a hunt, then record its grow-outs to track whether its traits hold on re-grow.";

const FALLBACK_HUNT_NAME = "Untitled hunt";

function detailFor(
  verdict: StabilityVerdict,
  runCount: number,
  driftedAxes: readonly string[],
): string {
  switch (verdict) {
    case "no_runs":
      return "No grow-outs recorded yet.";
    case "unconfirmed":
      return runCount <= 1
        ? "Recorded once — not yet re-grown."
        : "Re-grown, but no shared trait was re-scored yet.";
    case "holding":
      return `Held across ${runCount} recorded grow-outs.`;
    case "drifting":
      return driftedAxes.length > 0
        ? `Drifted on re-grow (${driftedAxes.join(", ")}).`
        : "Drifted on re-grow.";
    default:
      return "";
  }
}

/**
 * Build the cross-keeper stability roll-up. `huntNameById` resolves each
 * keeper's hunt label (from the already-loaded hunts list); a keeper whose
 * hunt is not in the map falls back to a neutral placeholder rather than
 * dropping out.
 */
export function buildStabilityDashboard(
  keepers: readonly StabilityDashboardKeeperInput[],
  huntNameById: Readonly<Record<string, string>>,
): StabilityDashboardModel {
  const list = Array.isArray(keepers) ? keepers : [];
  const counts: Record<StabilityVerdict, number> = {
    no_runs: 0,
    unconfirmed: 0,
    holding: 0,
    drifting: 0,
  };

  const entries: StabilityDashboardEntry[] = [];
  for (const k of list) {
    if (!k || typeof k.keeperId !== "string" || k.keeperId === "") continue;
    const evaluation = evaluateStability(k.stabilityRuns ?? []);
    counts[evaluation.verdict] += 1;
    const huntName =
      (typeof k.huntId === "string" && huntNameById[k.huntId]) || FALLBACK_HUNT_NAME;
    entries.push({
      keeperId: k.keeperId,
      keeperName: typeof k.keeperName === "string" && k.keeperName.trim() !== "" ? k.keeperName : "Unnamed keeper",
      huntId: typeof k.huntId === "string" ? k.huntId : "",
      huntName,
      verdict: evaluation.verdict,
      runCount: evaluation.runCount,
      driftedAxes: evaluation.driftedAxes,
      statusLabel: STABILITY_VERDICT_LABELS[evaluation.verdict],
      detail: detailFor(evaluation.verdict, evaluation.runCount, evaluation.driftedAxes),
    });
  }

  // Neutral, deterministic order: by hunt, then keeper name, then id. This is
  // structural/alphabetical ONLY — it never sorts keepers by how well they held
  // (that would be the leaderboard this feature must never become).
  entries.sort(
    (a, b) =>
      a.huntName.localeCompare(b.huntName) ||
      a.keeperName.localeCompare(b.keeperName) ||
      a.keeperId.localeCompare(b.keeperId),
  );

  return {
    entries,
    counts,
    totalKeepers: entries.length,
    keepersWithRuns: entries.filter((e) => e.verdict !== "no_runs").length,
  };
}

/** Display order for the aggregate stat chips (a stats layout, not a ranking). */
export const STABILITY_DASHBOARD_VERDICT_ORDER: readonly StabilityVerdict[] = [
  "holding",
  "drifting",
  "unconfirmed",
  "no_runs",
];

/**
 * alertStageResolution — resolve the stage that alert/threshold surfaces
 * evaluate VPD / temperature / humidity targets against.
 *
 * Why this exists (live audit, bug #14): the Alerts surface resolved its
 * "Alert context: Using <stage> targets" header and its alert persistence
 * from `grows.stage` alone, while every environment surface rendering the
 * SAME tent readings (Dashboard Environment Snapshot, Tent Detail, Sensors)
 * uses `tents.stage`. The two columns are written by different flows —
 * Quick Log writes `grows.stage` only when the grower touches the stage
 * select; Edit Tent writes `tents.stage`; both rows start at the "seedling"
 * creation default — so either column can lag the other, and the Alerts
 * surface claimed "Seedling targets" for a grow the grower had already
 * advanced to Vegetative.
 *
 * PRECEDENCE (explicit, deterministic):
 *  1. Candidates are the grow's own stage plus each of the grow's tents'
 *     stages, normalized to the canonical `STAGES` vocabulary via
 *     `normalizeQuickLogStage` (labels such as "Vegetative" and aliases
 *     such as plant-side "cure" are folded in; unknown text drops out).
 *  2. A single known candidate — or full agreement — wins outright.
 *  3. On disagreement, the MOST ADVANCED stage in `STAGES` order wins
 *     (seedling → veg → flower → flush → harvest → drying). A trailing
 *     value is a stale creation default the grower never advanced, not a
 *     decision; growers advance stage fields, they do not regress them.
 *     (An intentional regression — e.g. re-veg — requires updating the
 *     leading field, exactly as it did before this helper existed.)
 *  4. When no candidate is a known stage the result is null — callers keep
 *     their existing "no active stage target" handling. Never guess.
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { STAGES } from "@/lib/grow";
import { normalizeQuickLogStage } from "@/lib/quickLogStageDefaultRules";

/** Canonical stage progression rank, from the single STAGES source of truth. */
const STAGE_RANK: ReadonlyMap<string, number> = new Map(
  STAGES.map((s, index) => [s.value, index]),
);

export interface ResolveAlertContextStageInput {
  /** The grow row's stage (raw value or label; unknown text tolerated). */
  growStage?: unknown;
  /** Stages of the grow's tents (raw values or labels; unknowns drop out). */
  tentStages?: ReadonlyArray<unknown> | null;
}

export interface ResolvedAlertContextStage {
  /** Canonical `STAGES` value, or null when nothing is known. */
  stage: string | null;
  /** Which field supplied the winning stage. "grow" also covers ties. */
  source: "grow" | "tent" | null;
}

export function resolveAlertContextStage(
  input: ResolveAlertContextStageInput,
): ResolvedAlertContextStage {
  const growStage = normalizeQuickLogStage(input.growStage);
  let winner = growStage;
  let source: "grow" | "tent" | null = growStage ? "grow" : null;

  for (const raw of input.tentStages ?? []) {
    const tentStage = normalizeQuickLogStage(raw);
    if (!tentStage) continue;
    if (!winner) {
      winner = tentStage;
      source = "tent";
      continue;
    }
    const winnerRank = STAGE_RANK.get(winner) ?? -1;
    const tentRank = STAGE_RANK.get(tentStage) ?? -1;
    if (tentRank > winnerRank) {
      winner = tentStage;
      source = "tent";
    }
  }

  return { stage: winner, source };
}

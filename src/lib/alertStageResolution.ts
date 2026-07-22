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
 *     stages. Each is classified with the live `normalizeVpdStage` alias
 *     table (the same normalizer the downstream classifiers use, covering
 *     legacy tokens like "Vegetative", "transition", "bloom", "flush",
 *     "curing"); candidates it cannot recognize drop out.
 *  2. A single recognized candidate — or full agreement — wins outright.
 *  3. On disagreement, the MOST ADVANCED candidate in stage progression
 *     order wins (seedling → veg → preflower → flower → late_flower →
 *     harvest). A trailing value is a stale creation default the grower
 *     never advanced, not a decision; growers advance stage fields, they
 *     do not regress them. (An intentional regression — e.g. re-veg —
 *     requires updating the leading field, exactly as it did before this
 *     helper existed.) The grow's value wins rank ties, preserving its
 *     historical primacy.
 *  4. The winner is returned as the field's RAW stored value, not the
 *     normalized token, so downstream consumers (`classifyVpdAgainstStage`,
 *     `classifyTempAgainstStage`, header copy) receive exactly the string
 *     they would have received before this helper and keep their own alias
 *     handling.
 *  5. When no candidate is recognized the result is null — callers keep
 *     their existing "no active stage target" handling. Never guess. (This
 *     is stricter than the old raw passthrough only for garbage values the
 *     classifiers already treated as stage-unknown; the header now says
 *     "no active stage" instead of echoing the garbage token.)
 *
 * Known multi-tent residual (accepted): a harvested/curing tent still
 * linked to a grow with other active tents advances the grow-LEVEL context
 * to harvest, which intentionally drops cultivation bands (VPD becomes
 * context-only). Callers evaluating a reading from a specific tent should
 * therefore pass only that tent's stage in `tentStages` — the scoped
 * Dashboard passes the snapshot-selection tents for exactly this reason.
 * Grow-level surfaces (Alerts header/persist) accept the residual: it
 * matches the "furthest field is the grower's latest action" contract, and
 * suppressing cultivation alerts once a harvest-stage tent exists errs
 * quiet, never noisy.
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { normalizeVpdStage, type VpdStage } from "@/lib/vpdStageTargetRules";

/** Stage progression rank. `unknown` is not a candidate and has no rank. */
const STAGE_PROGRESSION: readonly Exclude<VpdStage, "unknown">[] = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
  "harvest",
];

function progressionRank(stage: VpdStage): number {
  return STAGE_PROGRESSION.indexOf(stage as Exclude<VpdStage, "unknown">);
}

export interface ResolveAlertContextStageInput {
  /** The grow row's stage (raw stored value; unknown text tolerated). */
  growStage?: unknown;
  /** The grow's tents' stages (raw stored values; unknowns drop out). */
  tentStages?: ReadonlyArray<unknown> | null;
}

export interface ResolvedAlertContextStage {
  /** RAW stored value of the winning field, or null when none recognized. */
  stage: string | null;
  /** The winner classified via `normalizeVpdStage`; "unknown" only when
   * `stage` is null. */
  normalizedStage: VpdStage;
  /** Which field supplied the winning stage. "grow" also covers ties. */
  source: "grow" | "tent" | null;
}

function asRawStage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveAlertContextStage(
  input: ResolveAlertContextStageInput,
): ResolvedAlertContextStage {
  let winnerRaw: string | null = null;
  let winnerNormalized: VpdStage = "unknown";
  let source: "grow" | "tent" | null = null;

  const growRaw = asRawStage(input.growStage);
  if (growRaw) {
    const normalized = normalizeVpdStage(growRaw);
    if (normalized !== "unknown") {
      winnerRaw = growRaw;
      winnerNormalized = normalized;
      source = "grow";
    }
  }

  for (const candidate of input.tentStages ?? []) {
    const raw = asRawStage(candidate);
    if (!raw) continue;
    const normalized = normalizeVpdStage(raw);
    if (normalized === "unknown") continue;
    // Strictly-greater keeps the grow (and earlier tents) winning ties.
    if (progressionRank(normalized) > progressionRank(winnerNormalized)) {
      winnerRaw = raw;
      winnerNormalized = normalized;
      source = "tent";
    }
  }

  return { stage: winnerRaw, normalizedStage: winnerNormalized, source };
}

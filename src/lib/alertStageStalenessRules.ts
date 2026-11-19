/**
 * alertStageStalenessRules — tell when an open alert was judged against a
 * different stage than the plant is at now.
 *
 * Why (field-notebook walk, 2026-11-19, friction item 1): a Flower plant
 * showed open alerts that quoted seedling ranges. Default-threshold alerts
 * write the stage they were judged against into their reason, e.g.
 * "Observed 1.3 kPa (seedling range 0.4–0.8 kPa)." or "VPD is above the
 * seedling target range." (defaultEnvironmentThresholds). An open row is only
 * refreshed when today's reading derives the same alert again, so an alert
 * born under the old stage can stay open with the old stage's numbers.
 *
 * This module only LABELS such an alert. It never resolves, dismisses or
 * rewrites it: the grower decides. `alerts` has no stage column, so the stage
 * is read back from the reason format this app writes itself.
 *
 * Never guess: an unparseable reason, or an unknown current stage, is never
 * stale.
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { normalizeVpdStage, type VpdStage } from "@/lib/vpdStageTargetRules";

const STAGE_WORD = "(seedling|veg|pre-?flower|flower|late[ _]flower|harvest)";
const RANGE_RE = new RegExp(`\\(${STAGE_WORD} range\\b`, "i");
const TARGET_RE = new RegExp(`\\bthe ${STAGE_WORD} target range\\b`, "i");

const STAGE_LABEL: Record<Exclude<VpdStage, "unknown">, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
};

/** The stage a persisted alert reason says it was judged against, or null. */
export function parseAlertEvaluatedStage(
  reason: string | null | undefined,
): Exclude<VpdStage, "unknown"> | null {
  if (typeof reason !== "string" || reason.trim() === "") return null;
  const match = reason.match(RANGE_RE) ?? reason.match(TARGET_RE);
  if (!match) return null;
  const stage = normalizeVpdStage(match[1]);
  return stage === "unknown" ? null : stage;
}

export interface AlertStageStaleness {
  readonly stale: boolean;
  readonly evaluatedStage: Exclude<VpdStage, "unknown"> | null;
  readonly currentStage: Exclude<VpdStage, "unknown"> | null;
  /** Calm note for the grower; null when not stale. */
  readonly note: string | null;
}

export function assessAlertStageStaleness(input: {
  readonly reason: string | null | undefined;
  readonly currentStage: string | null | undefined;
}): AlertStageStaleness {
  const evaluatedStage = parseAlertEvaluatedStage(input.reason);
  const normalizedCurrent = normalizeVpdStage(input.currentStage ?? null);
  const currentStage = normalizedCurrent === "unknown" ? null : normalizedCurrent;
  const stale = evaluatedStage !== null && currentStage !== null && evaluatedStage !== currentStage;
  return {
    stale,
    evaluatedStage,
    currentStage,
    note: stale
      ? buildAlertStageStaleNote(evaluatedStage as Exclude<VpdStage, "unknown">, currentStage!)
      : null,
  };
}

export function buildAlertStageStaleNote(
  evaluatedStage: Exclude<VpdStage, "unknown">,
  currentStage: Exclude<VpdStage, "unknown">,
): string {
  return `Checked against ${STAGE_LABEL[evaluatedStage]} targets. This plant is now ${STAGE_LABEL[currentStage]}, so this alert may no longer apply.`;
}

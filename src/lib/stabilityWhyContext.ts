/**
 * stabilityWhyContext — pure helper that derives a compact stage-aware VPD
 * band context string for the EnvironmentStabilityCard.
 *
 * Strict constraints (same envelope as `alertWhyContext`):
 *   - No I/O. No React. No Supabase. No fetch. No AI.
 *   - No alert writes. No Action Queue writes. No automation. No device control.
 *   - Read-only derivation from VpdStage → display copy.
 *   - Reuses canonical band table via `getVpdTargetBand`.
 */
import {
  getVpdTargetBand,
  normalizeVpdStage,
  type VpdStage,
} from "@/lib/vpdStageTargetRules";

export type StabilityWhyKind = "stage" | "context_only" | "unavailable";

export interface StabilityWhyContext {
  kind: StabilityWhyKind;
  stage: VpdStage;
  /** Display string the card should render. */
  text: string;
}

const STAGE_DISPLAY: Record<VpdStage, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
  unknown: "Stage unknown",
};

const UNAVAILABLE_TEXT = "Target context unavailable.";

function fmtVpd(v: number): string {
  return v.toFixed(1);
}

/**
 * Derive a compact "why" string from the stage used by the stability summary.
 *
 *   - Known stage with active band → `"<Stage> VPD target: <min>–<max> kPa"`.
 *   - Harvest / drying / context-only → context-only sentence (no breach band).
 *   - Unknown / legacy → `"Target context unavailable."`.
 */
export function deriveStabilityWhyContext(
  stage: string | null | undefined | VpdStage,
): StabilityWhyContext {
  const key = normalizeVpdStage(stage);
  if (key === "unknown") {
    return { kind: "unavailable", stage: key, text: UNAVAILABLE_TEXT };
  }
  const band = getVpdTargetBand(key);
  if (band.contextOnly || band.min === null || band.max === null) {
    return {
      kind: "context_only",
      stage: key,
      text: `${STAGE_DISPLAY[key]} stage — VPD shown as context only.`,
    };
  }
  return {
    kind: "stage",
    stage: key,
    text: `${STAGE_DISPLAY[key]} VPD target: ${fmtVpd(band.min)}–${fmtVpd(band.max)} kPa`,
  };
}

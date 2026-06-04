/**
 * vpdTargetRules — pure helper for evaluating a derived VPD value against
 * default stage target bands.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no alert writes, no Action Queue.
 *   - Stage MUST be known. Unknown / unsupported stage returns
 *     classification "stage_unknown" and is NEVER healthy.
 *   - Missing/invalid VPD returns "unavailable".
 *   - Stage is normalized to the canonical six-stage vocabulary via
 *     `normalizeToCanonicalVpdTargetStage`. Legacy app stages (veg,
 *     preflower, flower, late_flower) are mapped exactly as documented
 *     in `docs/vpd-stage-vocabulary.md`. The legacy → canonical mapping
 *     table is NOT duplicated here.
 *   - This helper does not create alerts; alert evaluation is a separate
 *     concern with its own safe path.
 */

import {
  VPD_STAGE_TARGETS,
  type VpdStageTarget,
} from "@/constants/vpdTargets";
import { normalizeToCanonicalVpdTargetStage } from "@/lib/vpdStageNormalizationRules";

export type VpdTargetClassification =
  | "low"
  | "in_band"
  | "high"
  | "stage_unknown"
  | "unavailable";

export interface EvaluateVpdAgainstStageTargetInput {
  vpdKpa: number | null | undefined;
  stage: string | null | undefined;
}

export interface EvaluateVpdAgainstStageTargetResult {
  classification: VpdTargetClassification;
  target: VpdStageTarget | null;
  /** True only when classification === "in_band". */
  healthy: boolean;
}

export function evaluateVpdAgainstStageTarget(
  input: EvaluateVpdAgainstStageTargetInput,
): EvaluateVpdAgainstStageTargetResult {
  const normalized = normalizeToCanonicalVpdTargetStage(input.stage);
  if (!normalized.known) {
    return { classification: "stage_unknown", target: null, healthy: false };
  }
  const target = VPD_STAGE_TARGETS[normalized.canonical];
  if (!target) {
    // Defensive: canonical stage missing from band table — never treat as healthy.
    return { classification: "stage_unknown", target: null, healthy: false };
  }
  const v = input.vpdKpa;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return { classification: "unavailable", target, healthy: false };
  }
  if (v < target.minKpa) {
    return { classification: "low", target, healthy: false };
  }
  if (v > target.maxKpa) {
    return { classification: "high", target, healthy: false };
  }
  return { classification: "in_band", target, healthy: true };
}

/**
 * vpdTargetRules — pure helper for evaluating a derived VPD value against
 * default stage target bands.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no alert writes, no Action Queue.
 *   - Stage MUST be known. Unknown / unsupported stage returns
 *     classification "stage_unknown" and is NEVER healthy.
 *   - Missing/invalid VPD returns "unavailable".
 *   - This helper does not create alerts; alert evaluation is a separate
 *     concern with its own safe path.
 */

import {
  VPD_STAGE_TARGETS,
  type VpdStageKey,
  type VpdStageTarget,
} from "@/constants/vpdTargets";

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

function normalizeStage(input: string | null | undefined): VpdStageKey | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s in VPD_STAGE_TARGETS) return s as VpdStageKey;
  return null;
}

export function evaluateVpdAgainstStageTarget(
  input: EvaluateVpdAgainstStageTargetInput,
): EvaluateVpdAgainstStageTargetResult {
  const stage = normalizeStage(input.stage);
  if (!stage) {
    return { classification: "stage_unknown", target: null, healthy: false };
  }
  const target = VPD_STAGE_TARGETS[stage];
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

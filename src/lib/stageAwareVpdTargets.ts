/**
 * Deprecated re-export shim.
 *
 * Canonical module: `src/lib/vpdStageTargetRules.ts`.
 * Kept so existing imports (Dashboard) continue to resolve unchanged.
 */
export {
  classifyVpdAgainstStage,
  getVpdTargetBand,
  normalizeVpdStage,
  vpdMetricChipStatus,
  VPD_DEADBAND_KPA,
  VPD_STAGE_HELPER_TEXT,
} from "./vpdStageTargetRules";
export type {
  VpdStage,
  VpdClassification,
  VpdTargetBand,
  VpdClassificationResult,
} from "./vpdStageTargetRules";

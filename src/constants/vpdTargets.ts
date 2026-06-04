/**
 * Default stage VPD target bands (kPa).
 *
 * Constants only. No I/O, no React. Conservative defaults intended for
 * derived VPD evaluation. Stage is required; unknown stage must NOT be
 * classified as healthy by consumers.
 *
 * Two vocabularies coexist:
 *   - Canonical six (match the seeded `vpd_targets` global rows):
 *       seedling, early_veg, late_veg, early_flower, mid_late_flower, ripening
 *   - Legacy app stages, retained for backwards compatibility:
 *       veg, preflower, flower, late_flower
 *
 * The legacy → canonical mapping table lives ONLY in
 * `src/lib/vpdStageNormalizationRules.ts`. Do not duplicate it here or in
 * any UI file. `evaluateVpdAgainstStageTarget` normalizes incoming stages
 * to canonical before band lookup.
 */

export type CanonicalVpdStageKey =
  | "seedling"
  | "early_veg"
  | "late_veg"
  | "early_flower"
  | "mid_late_flower"
  | "ripening";

export type LegacyVpdStageKey =
  | "veg"
  | "preflower"
  | "flower"
  | "late_flower";

export type VpdStageKey = CanonicalVpdStageKey | LegacyVpdStageKey;

export interface VpdStageTarget {
  stage: VpdStageKey;
  minKpa: number;
  maxKpa: number;
}

export const VPD_STAGE_TARGETS: Record<VpdStageKey, VpdStageTarget> = {
  // Canonical six — match seeded global rows in `vpd_targets`.
  seedling: { stage: "seedling", minKpa: 0.4, maxKpa: 0.8 },
  early_veg: { stage: "early_veg", minKpa: 0.7, maxKpa: 1.1 },
  late_veg: { stage: "late_veg", minKpa: 0.9, maxKpa: 1.2 },
  early_flower: { stage: "early_flower", minKpa: 1.0, maxKpa: 1.3 },
  mid_late_flower: { stage: "mid_late_flower", minKpa: 1.1, maxKpa: 1.5 },
  ripening: { stage: "ripening", minKpa: 1.2, maxKpa: 1.6 },
  // Legacy keys retained for back-compat consumers. Evaluator normalizes
  // these to canonical before lookup, so these literal bands are not used
  // for classification — they exist only so legacy code reading
  // `VPD_STAGE_TARGETS[legacy]` does not break.
  veg: { stage: "veg", minKpa: 0.8, maxKpa: 1.2 },
  preflower: { stage: "preflower", minKpa: 0.9, maxKpa: 1.3 },
  flower: { stage: "flower", minKpa: 1.0, maxKpa: 1.5 },
  late_flower: { stage: "late_flower", minKpa: 1.1, maxKpa: 1.5 },
};

/**
 * Default stage VPD target bands (kPa).
 *
 * Constants only. No I/O, no React. Conservative defaults intended for
 * derived VPD evaluation. Stage is required; unknown stage must NOT be
 * classified as healthy by consumers.
 */

export type VpdStageKey =
  | "seedling"
  | "veg"
  | "preflower"
  | "flower"
  | "late_flower";

export interface VpdStageTarget {
  stage: VpdStageKey;
  minKpa: number;
  maxKpa: number;
}

export const VPD_STAGE_TARGETS: Record<VpdStageKey, VpdStageTarget> = {
  seedling: { stage: "seedling", minKpa: 0.4, maxKpa: 0.8 },
  veg: { stage: "veg", minKpa: 0.8, maxKpa: 1.2 },
  preflower: { stage: "preflower", minKpa: 0.9, maxKpa: 1.3 },
  flower: { stage: "flower", minKpa: 1.0, maxKpa: 1.5 },
  late_flower: { stage: "late_flower", minKpa: 1.1, maxKpa: 1.5 },
};

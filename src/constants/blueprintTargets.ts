/**
 * blueprintTargets — per-stage "Pro Blueprint" target bands for the six
 * grow-environment metrics that do NOT already have a canonical per-stage
 * band table.
 *
 * Constants only. No I/O, no React, no Supabase, no automation.
 *
 * Scope / single-source-of-truth:
 *   - VPD is deliberately ABSENT here. VPD already has founder-tuned,
 *     DB-backed per-stage bands in `src/constants/vpdTargets.ts`
 *     (`VPD_STAGE_TARGETS`, mirrored by the `vpd_targets` table) and its own
 *     evaluator (`evaluateVpdAgainstStageTarget`). The Blueprint sources VPD
 *     from there — see `resolveBlueprintBand` in
 *     `src/lib/blueprintMetricRules.ts`. Do NOT add a `vpdKpa` band here; that
 *     would fork VPD into two competing band sets.
 *   - Stage keys are the canonical six (`CanonicalVpdTargetStage`). Callers
 *     normalize any incoming stage via `normalizeToCanonicalVpdTargetStage`
 *     before lookup. Unknown stage must NEVER be treated as healthy.
 *
 * Provenance of the numbers (IMPORTANT — these are the founder's IP):
 *   - `seedling` is taken VERBATIM from the Pro-Level Production SOP
 *     "Propagation" row.
 *   - Every other row INTERPOLATES the SOP's four phases (Propagation /
 *     Vegetative / Flowering) across the canonical six stages, and fills DLI
 *     where the SOP is silent, using standard indoor craft practice.
 *   - Temperature bands are DAY targets. The SOP splits day/night (e.g. veg
 *     night 19-22°C, flower night 17-20°C); day/night-aware temp scoring is a
 *     v2 refinement keyed off the tent light cycle. Until then, temp is scored
 *     against the lights-on target.
 *   - "Dry & Cure" (15-16°C / 58-62% RH) is a post-harvest ENVIRONMENT, not a
 *     live-plant stage, so it is intentionally not represented here.
 *
 * ⚠️ FOUNDER TO CONFIRM the interpolated rows before this ships to users.
 *
 * See: docs/spec-pro-blueprint-overlay.md
 */

import type { CanonicalVpdTargetStage } from "@/lib/vpdStageNormalizationRules";

/** A closed target range for a single metric. `min`/`max` are inclusive. */
export interface MetricBand {
  min: number;
  max: number;
}

/**
 * The six Blueprint metrics that carry their own bands here. VPD is excluded
 * on purpose (single-sourced from `VPD_STAGE_TARGETS`). Every field is
 * optional: a metric with no meaningful target for a given stage is simply
 * omitted, and the evaluator returns `no_target` for it.
 */
export interface BlueprintStageBands {
  /** Air temperature, °C (DAY target — see file header). */
  tempC?: MetricBand;
  /** Relative humidity, %. */
  rh?: MetricBand;
  /** Nutrient-solution / runoff EC, mS/cm. Sourced from feeding logs. */
  ec?: MetricBand;
  /** Nutrient-solution / runoff pH. Sourced from feeding logs. */
  ph?: MetricBand;
  /** Photosynthetic photon flux density, µmol/m²/s. */
  ppfd?: MetricBand;
  /** Daily light integral, mol/m²/day. */
  dli?: MetricBand;
}

export const SOP_BLUEPRINT_TARGETS: Record<CanonicalVpdTargetStage, BlueprintStageBands> = {
  // Verbatim from SOP "Propagation".
  seedling: {
    tempC: { min: 24, max: 26 },
    rh: { min: 70, max: 80 },
    ec: { min: 0.6, max: 0.8 },
    ph: { min: 5.8, max: 6.2 },
    ppfd: { min: 100, max: 250 },
    // DLI intentionally omitted — SOP gives none for propagation.
  },
  // Interpolated: SOP "Vegetative", early split.
  early_veg: {
    tempC: { min: 24, max: 27 },
    rh: { min: 65, max: 70 },
    ec: { min: 1.0, max: 1.3 },
    ph: { min: 5.8, max: 5.9 },
    ppfd: { min: 400, max: 550 },
    dli: { min: 20, max: 30 },
  },
  // Interpolated: SOP "Vegetative", late split.
  late_veg: {
    tempC: { min: 24, max: 27 },
    rh: { min: 60, max: 65 },
    ec: { min: 1.3, max: 1.8 },
    ph: { min: 5.8, max: 5.9 },
    ppfd: { min: 550, max: 700 },
    dli: { min: 30, max: 40 },
  },
  // Interpolated: SOP "Flowering", early (stretch / RH 50%).
  early_flower: {
    tempC: { min: 20, max: 26 },
    rh: { min: 45, max: 50 },
    ec: { min: 1.8, max: 2.2 },
    ph: { min: 5.8, max: 6.0 },
    ppfd: { min: 700, max: 900 },
    dli: { min: 35, max: 45 },
  },
  // Interpolated: SOP "Flowering", mid/late (RH 40-45%, peak feed).
  mid_late_flower: {
    tempC: { min: 20, max: 26 },
    rh: { min: 40, max: 45 },
    ec: { min: 2.2, max: 2.6 },
    ph: { min: 5.8, max: 6.0 },
    ppfd: { min: 800, max: 1000 },
    dli: { min: 35, max: 45 },
  },
  // Interpolated: SOP "Flowering", ripen / flush (EC drop, cooler nights).
  ripening: {
    tempC: { min: 18, max: 24 },
    rh: { min: 40, max: 45 },
    ec: { min: 1.0, max: 1.6 },
    ph: { min: 5.8, max: 6.0 },
    ppfd: { min: 700, max: 900 },
    dli: { min: 30, max: 40 },
  },
};

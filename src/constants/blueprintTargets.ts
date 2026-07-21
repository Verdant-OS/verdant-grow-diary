/**
 * blueprintTargets — per-stage "Pro Blueprint" target bands for the
 * grow-environment metrics that don't already have a canonical band table.
 *
 * Constants only. No I/O, no React, no Supabase, no automation.
 *
 * Stage vocabulary (IMPORTANT — matches the LIVE app stack, not the dead one):
 *   - `plants.stage` is a DB-enforced six-value set: seedling | veg | flower |
 *     flush | harvest | cure (default seedling). The live per-plant/tent
 *     environment panel normalizes these via `normalizeVpdStage`
 *     (src/lib/vpdStageTargetRules.ts) into the `VpdStage` vocabulary
 *     (seedling | veg | preflower | flower | late_flower | harvest | unknown):
 *     flush → late_flower, harvest & cure → harvest.
 *   - This table is therefore keyed by the NORMALIZED `VpdStage` (excluding
 *     "unknown"), so a Blueprint lookup lines up 1:1 with the app's existing
 *     VPD/temp/RH classification and never lands on `stage_unknown` for a real
 *     stored stage. Do NOT re-introduce the canonical
 *     seedling/early_veg/late_veg/... vocabulary — `plants.stage` cannot store
 *     it and its normalizer rejects flush/harvest/cure.
 *
 * VPD is single-sourced from `getVpdTargetBand` (vpdStageTargetRules.ts) — see
 * `resolveBlueprintBand` in blueprintMetricRules.ts. No `vpdKpa` band here.
 *
 * Day/night: temperature carries separate `day` / `night` bands. The overlay
 * picks one using the tent's `light.on` flag (`tents.light_on`), the only
 * ready per-tent day/night signal. Stages with no meaningful split use equal
 * day/night bands.
 *
 * Provenance of the numbers (founder IP):
 *   - `seedling` is verbatim from the SOP "Propagation" row; `harvest` uses the
 *     SOP "Dry & Cure" room targets (15-16 °C / 58-62 % RH) — the live stack
 *     treats harvest as context-only, so these dry-room bands are new value.
 *   - Other stages interpolate the SOP's Vegetative/Flowering phases and fill
 *     DLI where the SOP is silent, using standard indoor craft practice.
 *   - `preflower` is reachable only via the "transition" alias (no `plants.stage`
 *     value maps to it), so its band is a conservative early-flower interpolation.
 *
 * Founder-confirmed for user-facing display (2026-07-21): the interpolated
 * veg/preflower/flower/late_flower rows are approved to show to non-paying
 * growers (e.g. the locked Blueprint teaser), alongside the SOP-verbatim
 * seedling/harvest rows. Revisit the numbers as real grow data accrues.
 *
 * See: docs/spec-pro-blueprint-overlay.md
 */

import type { VpdStage } from "@/lib/vpdStageTargetRules";

/** A closed target range for a single metric. `min`/`max` are inclusive. */
export interface MetricBand {
  min: number;
  max: number;
}

/** Day (lights-on) and night (lights-off) variants of a band. */
export interface DayNightBand {
  day: MetricBand;
  night: MetricBand;
}

/** The normalized stages that carry Blueprint targets (VpdStage minus "unknown"). */
export type BlueprintTargetStage = Exclude<VpdStage, "unknown">;

/**
 * Blueprint bands for the six non-VPD metrics. VPD is single-sourced from
 * `getVpdTargetBand`. Temperature is day/night aware; the rest are single
 * bands. A metric with no meaningful target for a stage is omitted → the
 * evaluator returns `no_target`.
 */
export interface BlueprintStageBands {
  /** Air temperature, °C — day (lights-on) and night (lights-off). */
  tempC?: DayNightBand;
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

export const SOP_BLUEPRINT_TARGETS: Record<BlueprintTargetStage, BlueprintStageBands> = {
  // SOP "Propagation" (verbatim). No day/night split given.
  seedling: {
    tempC: { day: { min: 24, max: 26 }, night: { min: 24, max: 26 } },
    rh: { min: 70, max: 80 },
    ec: { min: 0.6, max: 0.8 },
    ph: { min: 5.8, max: 6.2 },
    ppfd: { min: 100, max: 250 },
    // DLI intentionally omitted — SOP gives none for propagation.
  },
  // SOP "Vegetative": day 24-27, night 19-22.
  veg: {
    tempC: { day: { min: 24, max: 27 }, night: { min: 19, max: 22 } },
    rh: { min: 60, max: 70 },
    ec: { min: 1.0, max: 1.8 },
    ph: { min: 5.8, max: 5.9 },
    ppfd: { min: 400, max: 700 },
    dli: { min: 25, max: 40 },
  },
  // Transition / pre-flower (reachable only via the "transition" alias).
  // Conservative early-flower interpolation.
  preflower: {
    tempC: { day: { min: 20, max: 26 }, night: { min: 18, max: 21 } },
    rh: { min: 50, max: 60 },
    ec: { min: 1.6, max: 2.0 },
    ph: { min: 5.8, max: 6.0 },
    ppfd: { min: 600, max: 800 },
    dli: { min: 30, max: 40 },
  },
  // SOP "Flowering": night 17-20; day inferred ~20-26.
  flower: {
    tempC: { day: { min: 20, max: 26 }, night: { min: 17, max: 20 } },
    rh: { min: 40, max: 50 },
    ec: { min: 1.8, max: 2.6 },
    ph: { min: 5.8, max: 6.0 },
    ppfd: { min: 700, max: 1000 },
    dli: { min: 35, max: 45 },
  },
  // Late flower / flush (plants.stage "flush" → normalized late_flower):
  // cooler, drier, EC dropped for the flush.
  late_flower: {
    tempC: { day: { min: 18, max: 24 }, night: { min: 17, max: 20 } },
    rh: { min: 40, max: 45 },
    ec: { min: 1.0, max: 1.6 },
    ph: { min: 5.8, max: 6.0 },
    ppfd: { min: 700, max: 900 },
    dli: { min: 30, max: 40 },
  },
  // SOP "Dry & Cure" (plants.stage harvest & cure → normalized harvest):
  // dark dry room, 15-16 °C / 58-62 % RH. No VPD/EC/pH/PPFD/DLI targets
  // post-harvest — VPD stays context-only in the live stack.
  harvest: {
    tempC: { day: { min: 15, max: 16 }, night: { min: 15, max: 16 } },
    rh: { min: 58, max: 62 },
  },
};

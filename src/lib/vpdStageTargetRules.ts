/**
 * vpdStageTargetRules — pure helper for stage-aware VPD target bands.
 *
 * Display-only domain logic for Verdant V0. Returns conservative VPD bands
 * per cultivation stage and classifies a displayed VPD value against the
 * stage-appropriate band with a small deadband so boundary values do not
 * flicker between in/below/above.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control.
 *   - No alert persistence writes.
 *   - No Action Queue writes.
 *   - No AI Doctor calls.
 *   - Stale readings keep stale labeling; classification is marked historical.
 *   - Raw VPD values are NEVER clamped — the caller's actual value is echoed.
 *
 * This file supersedes the earlier `stageAwareVpdTargets.ts`, which now
 * re-exports from here for backward compatibility with the Dashboard wiring.
 */

export type VpdStage =
  | "seedling"
  | "veg"
  | "preflower"
  | "flower"
  | "late_flower"
  | "harvest"
  | "unknown";

export type VpdClassification =
  | "below_target"
  | "in_target"
  | "above_target"
  | "unavailable"
  | "stage_unknown"
  | "context_only";

export interface VpdTargetBand {
  stage: VpdStage;
  /** Lower bound in kPa (inclusive minus deadband). null = no active target. */
  min: number | null;
  /** Upper bound in kPa (inclusive plus deadband). null = no active target. */
  max: number | null;
  /** Short helper sentence; always references stage-dependence. */
  helper: string;
  /** True when stage has no active VPD target (harvest). */
  contextOnly: boolean;
}

export interface VpdClassificationResult {
  band: VpdTargetBand;
  /** Raw input value, never clamped. */
  value: number | null;
  /** True when caller marked the reading as stale. */
  stale: boolean;
  classification: VpdClassification;
  /** Chip/badge label. */
  label: string;
  /** True when the classification is based on a stale reading. */
  historical: boolean;
}

/**
 * Conservative deadband (kPa). Boundary values fall inside `in_target` so the
 * UI does not flicker between in/below/above when a sensor jitters around a
 * range edge.
 */
export const VPD_DEADBAND_KPA = 0.05;

export const VPD_STAGE_HELPER_TEXT =
  "VPD targets depend on plant stage. Stale readings are historical and should not be treated as live conditions.";

const STAGE_LABEL: Record<VpdStage, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
  unknown: "Stage unknown",
};

const BAND_TABLE: Record<VpdStage, { min: number | null; max: number | null; helper: string; contextOnly: boolean }> = {
  seedling: {
    min: 0.4,
    max: 0.8,
    helper: `Seedlings prefer a low VPD. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: false,
  },
  veg: {
    min: 0.8,
    max: 1.2,
    helper: `Veg favors a mid VPD. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: false,
  },
  preflower: {
    min: 0.9,
    max: 1.3,
    helper: `Pre-flower nudges VPD slightly higher. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: false,
  },
  flower: {
    min: 1.0,
    max: 1.5,
    helper: `Flower runs a higher VPD. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: false,
  },
  late_flower: {
    min: 1.1,
    max: 1.5,
    helper: `Late flower keeps VPD on the higher side. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: false,
  },
  harvest: {
    min: null,
    max: null,
    helper: `Harvest stage has no active VPD target; shown as context only. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: true,
  },
  unknown: {
    min: 0.8,
    max: 1.4,
    helper: `Stage unknown — using a wide default band. Set the grow stage for stage-aware guidance. ${VPD_STAGE_HELPER_TEXT}`,
    contextOnly: false,
  },
};

export function normalizeVpdStage(input: string | null | undefined | VpdStage): VpdStage {
  if (!input) return "unknown";
  const s = String(input).trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "seedling":
    case "seed":
    case "sprout":
      return "seedling";
    case "veg":
    case "vegetative":
    case "vegetation":
      return "veg";
    case "preflower":
    case "pre_flower":
    case "transition":
      return "preflower";
    case "flower":
    case "flowering":
    case "bloom":
      return "flower";
    case "late_flower":
    case "lateflower":
    case "ripening":
    case "ripen":
    case "flush":
      return "late_flower";
    case "harvest":
    case "harvested":
    case "drying":
    case "cure":
    case "curing":
      return "harvest";
    default:
      return "unknown";
  }
}

export function getVpdTargetBand(stage: string | null | undefined | VpdStage): VpdTargetBand {
  const key = normalizeVpdStage(stage);
  return { stage: key, ...BAND_TABLE[key] };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function classifyVpdAgainstStage(input: {
  value: number | null | undefined;
  stage: string | null | undefined | VpdStage;
  stale?: boolean;
}): VpdClassificationResult {
  const band = getVpdTargetBand(input.stage);
  const value = isFiniteNumber(input.value) ? input.value : null;
  const stale = !!input.stale;

  if (value === null) {
    return {
      band,
      value: null,
      stale,
      classification: "unavailable",
      label: "VPD unavailable",
      historical: false,
    };
  }

  if (band.stage === "unknown") {
    return {
      band,
      value,
      stale,
      classification: "stage_unknown",
      label: `${STAGE_LABEL.unknown} — set stage for VPD guidance`,
      historical: stale,
    };
  }

  if (band.contextOnly || band.min === null || band.max === null) {
    return {
      band,
      value,
      stale,
      classification: "context_only",
      label: `${STAGE_LABEL[band.stage]} — VPD shown as context only`,
      historical: stale,
    };
  }

  const lo = band.min - VPD_DEADBAND_KPA;
  const hi = band.max + VPD_DEADBAND_KPA;
  let classification: VpdClassification;
  if (value < lo) classification = "below_target";
  else if (value > hi) classification = "above_target";
  else classification = "in_target";

  const stageLabel = STAGE_LABEL[band.stage];
  const base =
    classification === "in_target"
      ? `In ${stageLabel} VPD range`
      : classification === "below_target"
        ? `Below ${stageLabel} VPD range`
        : `Above ${stageLabel} VPD range`;

  return {
    band,
    value,
    stale,
    classification,
    label: stale ? `${base} (historical, stale reading)` : base,
    historical: stale,
  };
}

/** MetricChip-compatible status mapping. Stale -> warn (never "ok"). */
export function vpdMetricChipStatus(
  result: VpdClassificationResult,
): "ok" | "warn" | "bad" {
  if (result.stale) return "warn";
  switch (result.classification) {
    case "in_target":
      return "ok";
    case "below_target":
    case "above_target":
      return "warn";
    case "unavailable":
    case "stage_unknown":
    case "context_only":
    default:
      return "warn";
  }
}

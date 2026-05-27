/**
 * Pure helper for stage-aware VPD target ranges (Verdant V0).
 *
 * Returns conservative VPD bands per cultivation stage so that the UI can
 * classify a displayed VPD reading against a stage-appropriate range rather
 * than one generic band. No I/O, no React, no automation, no device control,
 * no Action Queue creation, no AI Doctor changes.
 *
 * Display-only. Stale readings are preserved as stale by the caller; this
 * helper exposes a separate `stale` flag so the classification can be marked
 * as historical/contextual rather than implying current health.
 *
 * Ranges are intentionally conservative and widely accepted starting points;
 * they are NOT a prescription and NOT a plant-health claim.
 */

export type VpdStage =
  | "seedling"
  | "veg"
  | "preflower"
  | "flower"
  | "late_flower"
  | "harvest"
  | "unknown";

export interface VpdTargetBand {
  /** Stage key used for the range lookup. */
  stage: VpdStage;
  /** Lower bound in kPa, inclusive. null when the stage has no active target. */
  min: number | null;
  /** Upper bound in kPa, inclusive. null when the stage has no active target. */
  max: number | null;
  /** Short helper text explaining the band / stage-dependence. */
  helper: string;
  /**
   * True when this stage has no active VPD target (currently `harvest`).
   * Callers should render context-only copy and avoid classifying values.
   */
  contextOnly: boolean;
}

export type VpdClassification =
  | "below_target"
  | "in_target"
  | "above_target"
  | "unavailable"
  | "stage_unknown";

export interface VpdClassificationResult {
  /** Stage band used for the comparison. */
  band: VpdTargetBand;
  /** Raw VPD value passed in (kPa). Never clamped. */
  value: number | null;
  /** Whether the reading was stale at classification time. */
  stale: boolean;
  /** Final display classification. */
  classification: VpdClassification;
  /** Short human label suitable for a chip / badge. */
  label: string;
  /**
   * True when classification is based on a stale reading. UI should preserve
   * the stale source label and treat the band as historical context.
   */
  historical: boolean;
}

const STAGE_LABEL: Record<VpdStage, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
  unknown: "Stage unknown",
};

const HELPER_BASE =
  "VPD targets depend on plant stage. These are conservative defaults, not a diagnosis.";

const BANDS: Record<VpdStage, Omit<VpdTargetBand, "stage">> = {
  seedling: {
    min: 0.4,
    max: 0.8,
    helper: `Seedlings prefer a low VPD. ${HELPER_BASE}`,
    contextOnly: false,
  },
  veg: {
    min: 0.8,
    max: 1.2,
    helper: `Veg favors a mid VPD. ${HELPER_BASE}`,
    contextOnly: false,
  },
  preflower: {
    min: 0.9,
    max: 1.3,
    helper: `Pre-flower nudges VPD slightly higher. ${HELPER_BASE}`,
    contextOnly: false,
  },
  flower: {
    min: 1.0,
    max: 1.5,
    helper: `Flower runs a higher VPD. ${HELPER_BASE}`,
    contextOnly: false,
  },
  late_flower: {
    min: 1.1,
    max: 1.5,
    helper: `Late flower keeps VPD on the higher side. ${HELPER_BASE}`,
    contextOnly: false,
  },
  harvest: {
    min: null,
    max: null,
    helper: `Harvest stage has no active VPD target; shown as context only. ${HELPER_BASE}`,
    contextOnly: true,
  },
  unknown: {
    min: 0.8,
    max: 1.4,
    helper: `Stage unknown — using a wide default band. Set the grow stage for stage-aware guidance. ${HELPER_BASE}`,
    contextOnly: false,
  },
};

/**
 * Normalize a free-form stage string (from grows.stage / diary stage / plant
 * stage) into a VpdStage key. Unknown / null / empty inputs map to "unknown".
 */
export function normalizeVpdStage(input: string | null | undefined): VpdStage {
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

/** Return the stage-aware VPD band for a given stage input. */
export function getVpdTargetBand(
  stage: string | null | undefined | VpdStage,
): VpdTargetBand {
  const key = normalizeVpdStage(typeof stage === "string" ? stage : stage ?? null);
  return { stage: key, ...BANDS[key] };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Classify a VPD reading against the stage-aware band.
 *
 * - Never clamps the raw value.
 * - Stale readings keep their stale label and are classified as historical.
 * - Harvest stage / context-only bands always return "unavailable" for
 *   classification (no active target) but expose the band for copy.
 * - Unknown stage returns "stage_unknown" so the UI can prompt for stage.
 */
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
      label: `${STAGE_LABEL[band.stage]} — set stage for VPD guidance`,
      historical: stale,
    };
  }

  if (band.contextOnly || band.min === null || band.max === null) {
    return {
      band,
      value,
      stale,
      classification: "unavailable",
      label: `${STAGE_LABEL[band.stage]} — VPD shown as context only`,
      historical: stale,
    };
  }

  let classification: VpdClassification;
  if (value < band.min) classification = "below_target";
  else if (value > band.max) classification = "above_target";
  else classification = "in_target";

  const baseLabel =
    classification === "in_target"
      ? `In ${STAGE_LABEL[band.stage]} VPD range`
      : classification === "below_target"
        ? `Below ${STAGE_LABEL[band.stage]} VPD range`
        : `Above ${STAGE_LABEL[band.stage]} VPD range`;

  return {
    band,
    value,
    stale,
    classification,
    label: stale ? `${baseLabel} (historical, stale reading)` : baseLabel,
    historical: stale,
  };
}

export const VPD_STAGE_HELPER_TEXT = HELPER_BASE;

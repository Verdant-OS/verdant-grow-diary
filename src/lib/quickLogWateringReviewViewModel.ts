/** Pure review model for the structured Quick Log Water form. */

import type { QuickLogWateringFormState } from "./quickLogWateringFormViewModel";

export const WATERING_REVIEW_TITLE = "Review watering record" as const;
export const WATERING_REVIEW_NEEDS_INPUT =
  "Add the applied volume to preview the watering record." as const;
export const WATERING_REVIEW_SAFETY_NOTE =
  "Recorded evidence only. Verdant does not infer a schedule, dryback, or watering decision from this entry." as const;

export interface WateringReviewItem {
  label: string;
  value: string;
}

export interface WateringReviewModel {
  needsInput: boolean;
  measurements: readonly WateringReviewItem[];
  manualObservations: readonly WateringReviewItem[];
  safetyNote: typeof WATERING_REVIEW_SAFETY_NOTE;
}

const POT_WEIGHT_LABELS: Record<Exclude<QuickLogWateringFormState["potWeightFeel"], "">, string> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
};
const MEDIUM_SURFACE_LABELS: Record<
  Exclude<QuickLogWateringFormState["mediumSurface"], "">,
  string
> = {
  dry: "Dry",
  moist: "Moist",
  wet: "Wet",
};
const DRAINAGE_LABELS: Record<Exclude<QuickLogWateringFormState["drainage"], "">, string> = {
  normal: "Normal",
  slow: "Slow",
  none: "None observed",
};

function pushIfPresent(items: WateringReviewItem[], label: string, raw: string): void {
  const value = raw.trim();
  if (value !== "") items.push({ label, value });
}

export function buildWateringReview(form: QuickLogWateringFormState): WateringReviewModel {
  const volumeRaw = form.volumeMl.trim();
  const volume = /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(volumeRaw) ? Number(volumeRaw) : Number.NaN;
  const needsInput = !Number.isFinite(volume) || volume <= 0 || volume > 1_000_000;
  const measurements: WateringReviewItem[] = [];
  pushIfPresent(measurements, "Applied volume (ml)", form.volumeMl);
  pushIfPresent(measurements, "Input pH", form.ph);
  pushIfPresent(measurements, "Input EC (mS/cm)", form.ec);
  pushIfPresent(measurements, "Input PPM (500)", form.ppm);
  pushIfPresent(measurements, "Runoff (ml)", form.runoffMl);
  pushIfPresent(measurements, "Runoff pH", form.runoffPh);
  pushIfPresent(measurements, "Runoff EC (mS/cm)", form.runoffEc);
  pushIfPresent(measurements, "Runoff PPM (500)", form.runoffPpm);
  pushIfPresent(measurements, "Water temperature (°C)", form.waterTempC);

  const manualObservations: WateringReviewItem[] = [];
  if (form.potWeightFeel) {
    manualObservations.push({
      label: "Pre-water pot weight",
      value: POT_WEIGHT_LABELS[form.potWeightFeel],
    });
  }
  if (form.mediumSurface) {
    manualObservations.push({
      label: "Medium surface",
      value: MEDIUM_SURFACE_LABELS[form.mediumSurface],
    });
  }
  if (form.drainage) {
    manualObservations.push({
      label: "Drainage",
      value: DRAINAGE_LABELS[form.drainage],
    });
  }

  return {
    needsInput,
    measurements: Object.freeze(measurements),
    manualObservations: Object.freeze(manualObservations),
    safetyNote: WATERING_REVIEW_SAFETY_NOTE,
  };
}

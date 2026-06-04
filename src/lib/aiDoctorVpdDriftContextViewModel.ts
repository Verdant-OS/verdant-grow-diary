/**
 * aiDoctorVpdDriftContextViewModel — pure presenter for the read-only
 * "VPD Drift" block surfaced inside AI Doctor context details.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no fetch.
 *   - No alert writes, no Action Queue writes, no automation, no device
 *     control. This is transparency only — it shows what Verdant
 *     already considered.
 *   - VPD is DERIVED. Labels must never say "Live".
 *   - Wraps the existing `AiDoctorVpdDriftContext` produced by
 *     `vpdDriftRules.buildVpdDriftAiContext` (already wired through
 *     `aiDoctorSensorContextRules.mapSensorReadingToAiDoctorContext`).
 *     This view-model never re-classifies — it only formats.
 *   - Does NOT duplicate the VPD stage target table here or in JSX.
 *   - For sustained drift, only review-first copy is emitted. No
 *     nutrient, irrigation, or equipment/device recommendations.
 */

import type {
  AiDoctorVpdDriftContext,
  VpdDriftClassification,
} from "./vpdDriftRules";

export type AiDoctorVpdDriftPresenterStatus =
  | "insufficient_data"
  | "in_band"
  | "sustained_high"
  | "sustained_low"
  | "unavailable";

export interface AiDoctorVpdDriftSectionViewModel {
  /** Whether the presenter should render anything at all. */
  visible: boolean;
  status: AiDoctorVpdDriftPresenterStatus;
  /** Heading label. Always says "VPD Drift". */
  headingLabel: string;
  /** Always "Derived VPD". Never "Live". */
  vpdLabel: string;
  /** Formatted current derived VPD, e.g. "1.42 kPa". null when unknown. */
  currentVpdLabel: string | null;
  /** Formatted target band, e.g. "0.80–1.20 kPa". null when unknown. */
  targetBandLabel: string | null;
  /** Short status label for the chip. */
  statusLabel: string;
  /** Tone hint for styling. */
  statusTone: "ok" | "warn" | "muted" | "unavailable";
  /** Calm primary copy describing the current drift state. */
  primaryCopy: string;
  /**
   * Review-first guidance copy. Empty string when no review is suggested.
   * NEVER mentions nutrient/irrigation/equipment changes or direct device
   * actions.
   */
  reviewCopy: string;
  /** Whether the caller-supplied context flagged `suggestReview`. */
  suggestReview: boolean;
  /** Mandatory safety note explaining no automatic action was taken. */
  safetyNote: string;
}

export const VPD_DRIFT_SECTION_HEADING = "VPD Drift";
export const VPD_DRIFT_VPD_LABEL = "Derived VPD";

export const VPD_DRIFT_SAFETY_NOTE =
  "Verdant did not take any automatic action from this VPD drift signal. Review only.";

export const VPD_DRIFT_INSUFFICIENT_COPY =
  "Not enough recent VPD data to identify a drift pattern.";

export const VPD_DRIFT_IN_BAND_COPY =
  "Recent derived VPD has stayed inside the stage target band.";

export const VPD_DRIFT_SUSTAINED_HIGH_COPY =
  "Derived VPD has stayed above the stage target band recently.";

export const VPD_DRIFT_SUSTAINED_LOW_COPY =
  "Derived VPD has stayed below the stage target band recently.";

export const VPD_DRIFT_UNAVAILABLE_COPY =
  "Derived VPD drift could not be evaluated.";

export const VPD_DRIFT_REVIEW_COPY =
  "Review temperature, humidity, airflow, and stage targets before making changes.";

function classify(
  ctx: AiDoctorVpdDriftContext,
): AiDoctorVpdDriftPresenterStatus {
  const c: VpdDriftClassification = ctx.classification;
  if (c === "insufficient") return "insufficient_data";
  if (c === "in_band") return "in_band";
  if (c === "sustained_high") return "sustained_high";
  if (c === "sustained_low") return "sustained_low";
  return "unavailable";
}

function formatKpa(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `${n.toFixed(2)} kPa`;
}

function formatBand(
  low: number | null | undefined,
  high: number | null | undefined,
): string | null {
  if (
    typeof low !== "number" ||
    typeof high !== "number" ||
    !Number.isFinite(low) ||
    !Number.isFinite(high)
  ) {
    return null;
  }
  return `${low.toFixed(2)}–${high.toFixed(2)} kPa`;
}

const EMPTY_VM: AiDoctorVpdDriftSectionViewModel = {
  visible: false,
  status: "unavailable",
  headingLabel: VPD_DRIFT_SECTION_HEADING,
  vpdLabel: VPD_DRIFT_VPD_LABEL,
  currentVpdLabel: null,
  targetBandLabel: null,
  statusLabel: "",
  statusTone: "unavailable",
  primaryCopy: "",
  reviewCopy: "",
  suggestReview: false,
  safetyNote: VPD_DRIFT_SAFETY_NOTE,
};

export function buildAiDoctorVpdDriftSectionViewModel(
  vpdDrift: AiDoctorVpdDriftContext | null | undefined,
): AiDoctorVpdDriftSectionViewModel {
  if (!vpdDrift) return EMPTY_VM;

  const status = classify(vpdDrift);
  const currentVpdLabel = formatKpa(vpdDrift.ewmaKpa);
  const targetBandLabel = formatBand(vpdDrift.lowKpa, vpdDrift.highKpa);

  let statusLabel: string;
  let statusTone: AiDoctorVpdDriftSectionViewModel["statusTone"];
  let primaryCopy: string;
  let reviewCopy = "";

  switch (status) {
    case "insufficient_data":
      statusLabel = "Insufficient data";
      statusTone = "muted";
      primaryCopy = VPD_DRIFT_INSUFFICIENT_COPY;
      break;
    case "in_band":
      statusLabel = "In target band";
      statusTone = "ok";
      primaryCopy = VPD_DRIFT_IN_BAND_COPY;
      break;
    case "sustained_high":
      statusLabel = "Sustained above target";
      statusTone = "warn";
      primaryCopy = VPD_DRIFT_SUSTAINED_HIGH_COPY;
      reviewCopy = VPD_DRIFT_REVIEW_COPY;
      break;
    case "sustained_low":
      statusLabel = "Sustained below target";
      statusTone = "warn";
      primaryCopy = VPD_DRIFT_SUSTAINED_LOW_COPY;
      reviewCopy = VPD_DRIFT_REVIEW_COPY;
      break;
    case "unavailable":
    default:
      statusLabel = "Unavailable";
      statusTone = "unavailable";
      primaryCopy = VPD_DRIFT_UNAVAILABLE_COPY;
      break;
  }

  const suggestReview = !!vpdDrift.suggestReview;
  if (suggestReview && !reviewCopy) {
    reviewCopy = VPD_DRIFT_REVIEW_COPY;
  }

  return {
    visible: true,
    status,
    headingLabel: VPD_DRIFT_SECTION_HEADING,
    vpdLabel: VPD_DRIFT_VPD_LABEL,
    currentVpdLabel,
    targetBandLabel,
    statusLabel,
    statusTone,
    primaryCopy,
    reviewCopy,
    suggestReview,
    safetyNote: VPD_DRIFT_SAFETY_NOTE,
  };
}

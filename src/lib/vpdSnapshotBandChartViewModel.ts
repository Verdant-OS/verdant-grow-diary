/**
 * vpdSnapshotBandChartViewModel — pure presenter for the small "current
 * derived VPD vs target band" chart shown next to a sensor snapshot.
 *
 * Contract:
 *   - Pure. No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control, no alert / Action Queue writes.
 *   - VPD is DERIVED. Never labeled "Live".
 *   - Stage normalization is delegated to `vpdStageNormalizationRules`.
 *   - Band evaluation is delegated to `vpdTargetRules`.
 *   - This module does NOT duplicate the legacy → canonical mapping
 *     table or the per-stage band table.
 */

import {
  evaluateVpdAgainstStageTarget,
  type VpdTargetClassification,
} from "@/lib/vpdTargetRules";
import {
  normalizeToCanonicalVpdTargetStage,
  type CanonicalVpdTargetStage,
} from "@/lib/vpdStageNormalizationRules";

/** Chart axis range (kPa). Wide enough to span every canonical band. */
export const VPD_BAND_CHART_AXIS_MIN_KPA = 0;
export const VPD_BAND_CHART_AXIS_MAX_KPA = 2.0;

export interface VpdSnapshotBandChartInput {
  /** Derived VPD in kPa. Null if temp/RH were missing. */
  vpdKpa: number | null | undefined;
  /** Raw app stage (legacy or canonical or unknown). */
  stage: string | null | undefined;
}

export type VpdSnapshotBandChartStatus =
  | "low"
  | "in_band"
  | "high"
  | "stage_unknown"
  | "unavailable";

export interface VpdSnapshotBandChartViewModel {
  /** Always "Derived VPD". Never "Live VPD". */
  vpdLabel: "Derived VPD";
  /** Current derived VPD in kPa, or null when unavailable. */
  currentVpdKpa: number | null;
  /** Canonical stage if known, else null. */
  canonicalStage: CanonicalVpdTargetStage | null;
  /** Canonical stage display label, else null. */
  canonicalStageLabel: string | null;
  /** Target band min in kPa, else null. */
  targetMinKpa: number | null;
  /** Target band max in kPa, else null. */
  targetMaxKpa: number | null;
  /** Human-readable band copy, e.g. "0.90–1.20 kPa", else null. */
  targetBandLabel: string | null;
  /** Bucketed status from band evaluation. */
  status: VpdSnapshotBandChartStatus;
  /** Underlying evaluator classification (1:1 with status today). */
  classification: VpdTargetClassification;
  /**
   * Marker x-position as a percentage of the chart axis, clamped to
   * [0, 100]. Null when VPD is unavailable.
   */
  markerPercent: number | null;
  /** Band start as a percentage of the chart axis, or null. */
  bandStartPercent: number | null;
  /** Band end as a percentage of the chart axis, or null. */
  bandEndPercent: number | null;
  /** Whether to render the chart (vs. unavailable copy). */
  renderable: boolean;
  /** Short review-first guidance. Never recommends device/automation. */
  guidanceLabel: string;
  /** Accessible chart description for `aria-label`. */
  ariaLabel: string;
  /** Axis bounds in kPa, for reference. */
  axisMinKpa: number;
  axisMaxKpa: number;
}

const CANONICAL_LABELS: Record<CanonicalVpdTargetStage, string> = {
  seedling: "Seedling",
  early_veg: "Early veg",
  late_veg: "Late veg",
  early_flower: "Early flower",
  mid_late_flower: "Mid–late flower",
  ripening: "Ripening",
};

const VPD_BAND_CHART_GUIDANCE: Record<VpdSnapshotBandChartStatus, string> = {
  low: "Review humidity, temperature, and airflow before making changes.",
  in_band: "VPD is within the target band for this stage.",
  high: "Review temperature, humidity, airflow, and stage targets before making changes.",
  stage_unknown:
    "Stage target unavailable. Confirm plant stage before interpreting VPD.",
  unavailable: "VPD unavailable. Temp and humidity are needed.",
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function kpaToPercent(kpa: number): number {
  const span = VPD_BAND_CHART_AXIS_MAX_KPA - VPD_BAND_CHART_AXIS_MIN_KPA;
  return clampPct(((kpa - VPD_BAND_CHART_AXIS_MIN_KPA) / span) * 100);
}

function formatKpa(n: number): string {
  return n.toFixed(2);
}

export function buildVpdSnapshotBandChartViewModel(
  input: VpdSnapshotBandChartInput,
): VpdSnapshotBandChartViewModel {
  const normalized = normalizeToCanonicalVpdTargetStage(input.stage);
  const evaluation = evaluateVpdAgainstStageTarget({
    vpdKpa: input.vpdKpa ?? null,
    stage: input.stage ?? null,
  });

  const status = evaluation.classification as VpdSnapshotBandChartStatus;
  const canonicalStage = normalized.known ? normalized.canonical : null;
  const canonicalStageLabel = canonicalStage
    ? CANONICAL_LABELS[canonicalStage]
    : null;

  const currentVpdKpa =
    typeof input.vpdKpa === "number" && Number.isFinite(input.vpdKpa)
      ? input.vpdKpa
      : null;

  const targetMinKpa = evaluation.target?.minKpa ?? null;
  const targetMaxKpa = evaluation.target?.maxKpa ?? null;
  const targetBandLabel =
    targetMinKpa !== null && targetMaxKpa !== null
      ? `${formatKpa(targetMinKpa)}–${formatKpa(targetMaxKpa)} kPa`
      : null;

  const renderable =
    status !== "stage_unknown" && status !== "unavailable" && currentVpdKpa !== null;

  const markerPercent =
    currentVpdKpa !== null ? kpaToPercent(currentVpdKpa) : null;
  const bandStartPercent = targetMinKpa !== null ? kpaToPercent(targetMinKpa) : null;
  const bandEndPercent = targetMaxKpa !== null ? kpaToPercent(targetMaxKpa) : null;

  const guidanceLabel = VPD_BAND_CHART_GUIDANCE[status];

  const ariaLabel =
    renderable && currentVpdKpa !== null && targetBandLabel
      ? `Derived VPD ${formatKpa(currentVpdKpa)} kPa compared to ${canonicalStageLabel ?? "stage"} target band ${targetBandLabel}. Status: ${status.replace("_", " ")}.`
      : `Derived VPD chart unavailable. ${guidanceLabel}`;

  return {
    vpdLabel: "Derived VPD",
    currentVpdKpa,
    canonicalStage,
    canonicalStageLabel,
    targetMinKpa,
    targetMaxKpa,
    targetBandLabel,
    status,
    classification: evaluation.classification,
    markerPercent,
    bandStartPercent,
    bandEndPercent,
    renderable,
    guidanceLabel,
    ariaLabel,
    axisMinKpa: VPD_BAND_CHART_AXIS_MIN_KPA,
    axisMaxKpa: VPD_BAND_CHART_AXIS_MAX_KPA,
  };
}

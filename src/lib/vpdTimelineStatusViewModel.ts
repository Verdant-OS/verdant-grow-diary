/**
 * vpdTimelineStatusViewModel — pure presenter for the diary timeline VPD
 * status widget. Used by timeline entries that carry a sensor snapshot.
 *
 * Contract:
 *   - Pure. No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control, no alert / Action Queue writes.
 *   - VPD is DERIVED. Never labeled "Live".
 *   - Guidance is review-first only. No nutrient / irrigation / equipment
 *     / device-control recommendations from VPD alone.
 *   - Does NOT duplicate the legacy → canonical mapping table or the
 *     per-stage band table.
 */

import {
  evaluateVpdAgainstStageTarget,
  type VpdTargetClassification,
} from "@/lib/vpdTargetRules";
import {
  normalizeToCanonicalVpdTargetStage,
  type CanonicalVpdTargetStage,
} from "@/lib/vpdStageNormalizationRules";
import { calculateAirVpdKpa } from "@/lib/vpdRules";

export type VpdTimelineStatus =
  | "low"
  | "in_target"
  | "high"
  | "stage_unknown"
  | "unavailable";

export interface VpdTimelineStatusInput {
  /** Optional pre-derived VPD (kPa). */
  vpdKpa?: number | null;
  /** Optional air temp °C — used to derive VPD when no vpdKpa supplied. */
  airTempC?: number | null;
  /** Optional air temp °F — used to derive VPD when no vpdKpa supplied. */
  airTempF?: number | null;
  /** Optional relative humidity (%). */
  humidityPct?: number | null;
  /** Raw app stage (legacy or canonical or unknown). */
  stage?: string | null;
}

export interface VpdTimelineStatusViewModel {
  /** Whether this widget should render at all. */
  shouldRender: boolean;
  /** Always "Derived VPD". Never "Live VPD". */
  vpdLabel: "Derived VPD";
  /** Current derived VPD in kPa, or null when unavailable. */
  vpdKpa: number | null;
  /** Canonical stage if known, else null. */
  canonicalStage: CanonicalVpdTargetStage | null;
  /** Canonical stage display label, else null. */
  canonicalStageLabel: string | null;
  /** Human-readable band copy, e.g. "0.90–1.20 kPa", else null. */
  targetBandLabel: string | null;
  /** Bucketed status for the timeline. */
  status: VpdTimelineStatus;
  /** Short, user-facing status label. */
  statusLabel: string;
  /** Review-first guidance copy. */
  guidanceLabel: string;
  /** Underlying band evaluator classification. */
  classification: VpdTargetClassification;
  /** Tone hint for styling. */
  tone: "ok" | "warn" | "muted" | "unavailable";
}

const CANONICAL_LABELS: Record<CanonicalVpdTargetStage, string> = {
  seedling: "Seedling",
  early_veg: "Early veg",
  late_veg: "Late veg",
  early_flower: "Early flower",
  mid_late_flower: "Mid–late flower",
  ripening: "Ripening",
};

export const VPD_TIMELINE_GUIDANCE: Record<VpdTimelineStatus, string> = {
  low: "Review humidity, temperature, and airflow before making changes.",
  in_target: "VPD is within the target band for this stage.",
  high: "Review temperature, humidity, airflow, and stage targets before making changes.",
  stage_unknown:
    "Stage target unavailable. Confirm plant stage before interpreting VPD.",
  unavailable: "VPD unavailable. Temp and humidity are needed.",
};

const STATUS_LABEL: Record<VpdTimelineStatus, string> = {
  low: "Low",
  in_target: "In target",
  high: "High",
  stage_unknown: "Stage unknown",
  unavailable: "Unavailable",
};

const STATUS_TONE: Record<VpdTimelineStatus, VpdTimelineStatusViewModel["tone"]> = {
  low: "warn",
  in_target: "ok",
  high: "warn",
  stage_unknown: "muted",
  unavailable: "unavailable",
};

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function classificationToStatus(c: VpdTargetClassification): VpdTimelineStatus {
  switch (c) {
    case "in_band":
      return "in_target";
    case "low":
      return "low";
    case "high":
      return "high";
    case "stage_unknown":
      return "stage_unknown";
    case "unavailable":
    default:
      return "unavailable";
  }
}

export function buildVpdTimelineStatusViewModel(
  input: VpdTimelineStatusInput,
): VpdTimelineStatusViewModel {
  const directVpd = toFinite(input.vpdKpa);
  const tempC = toFinite(input.airTempC);
  const tempF = toFinite(input.airTempF);
  const rh = toFinite(input.humidityPct);

  const derived =
    directVpd !== null
      ? directVpd
      : calculateAirVpdKpa({
          tempC: tempC ?? undefined,
          tempF: tempF ?? undefined,
          rhPercent: rh,
        });

  // Render only if we have enough context: either a stored/derived VPD,
  // or enough temp + RH to derive one.
  const hasDerivable =
    derived !== null || (rh !== null && (tempC !== null || tempF !== null));
  const normalized = normalizeToCanonicalVpdTargetStage(input.stage);
  const shouldRender = hasDerivable;

  const evaluation = evaluateVpdAgainstStageTarget({
    vpdKpa: derived,
    stage: input.stage ?? null,
  });

  const status = classificationToStatus(evaluation.classification);
  const canonicalStage = normalized.known ? normalized.canonical : null;
  const canonicalStageLabel = canonicalStage ? CANONICAL_LABELS[canonicalStage] : null;
  const targetBandLabel = evaluation.target
    ? `${evaluation.target.minKpa.toFixed(2)}–${evaluation.target.maxKpa.toFixed(2)} kPa`
    : null;

  return {
    shouldRender,
    vpdLabel: "Derived VPD",
    vpdKpa: derived,
    canonicalStage,
    canonicalStageLabel,
    targetBandLabel,
    status,
    statusLabel: STATUS_LABEL[status],
    guidanceLabel: VPD_TIMELINE_GUIDANCE[status],
    classification: evaluation.classification,
    tone: STATUS_TONE[status],
  };
}

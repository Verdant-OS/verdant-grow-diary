/**
 * derivedVpdStatusViewModel — pure presenter for the "Derived VPD" UI block.
 *
 * Contract:
 *   - No I/O, no React, no Supabase, no fetch, no automation.
 *   - No alert writes, no Action Queue writes, no device control.
 *   - Wraps existing pure helpers: `calculateAirVpdKpa` and
 *     `evaluateVpdAgainstStageTarget`. Does NOT duplicate the stage
 *     target table here or in JSX.
 *   - VPD is DERIVED. It must never be labeled "Live". Source enum is
 *     untouched.
 *   - Stage-unknown must never render healthy/in-target language.
 */

import { evaluateVpdAgainstStageTarget, type VpdTargetClassification } from "./vpdTargetRules";
import {
  evaluateVpdMeasurementTrust,
  type VpdMeasurementEvidence,
  type VpdMeasurementTrustIssue,
} from "./vpdMeasurementTrustStatusRules";

export interface DerivedVpdStatusInput {
  airTempC?: number | string | null;
  airTempF?: number | string | null;
  humidityPct?: number | string | null;
  leafTempC?: number | string | null;
  leafTempF?: number | string | null;
  measurementEvidence?: VpdMeasurementEvidence | null;
  nowMs?: number;
  /** Optional grow stage. Unknown → no in-target language. */
  stage?: string | null;
}

export interface DerivedVpdStatusViewModel {
  /** True only when temp + RH produced a finite derived VPD. */
  available: boolean;
  /** Derived VPD in kPa, rounded by calculateAirVpdKpa. */
  vpdKpa: number | null;
  classification: VpdTargetClassification | "unverified";
  /** UI label, always prefixed with "Derived". Never says "Live". */
  vpdLabel: "Verified leaf VPD" | "Leaf VPD estimate" | "Air VPD estimate";
  /** Short status label, e.g. "In target", "Below target". */
  statusLabel: string;
  /** Tone hint for styling. */
  statusTone: "ok" | "warn" | "muted" | "unavailable";
  /** Help/tooltip copy. */
  helpCopy: string;
  /** Optional band copy from the matched target, e.g. "0.80–1.20 kPa". */
  targetBandLabel: string | null;
  canCompareToStageTarget: boolean;
  confidence: "verified" | "reduced" | "unverified" | "invalid";
  issues: ReadonlyArray<VpdMeasurementTrustIssue>;
}

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const DERIVED_VPD_HELP_COPY =
  "Air VPD is an estimate from air temperature and humidity. A target claim requires calibrated temperature and RH evidence plus a contemporaneous leaf-temperature measurement at canopy level.";

export function buildDerivedVpdStatusViewModel(
  input: DerivedVpdStatusInput,
): DerivedVpdStatusViewModel {
  const trust = evaluateVpdMeasurementTrust({
    airTempC: toFinite(input.airTempC),
    airTempF: toFinite(input.airTempF),
    leafTempC: toFinite(input.leafTempC),
    leafTempF: toFinite(input.leafTempF),
    humidityPct: toFinite(input.humidityPct),
    evidence: input.measurementEvidence,
    nowMs: input.nowMs,
  });

  const vpdKpa = trust.valueKpa;

  const evaluation = evaluateVpdAgainstStageTarget({
    vpdKpa,
    stage: input.stage ?? null,
  });

  const available = vpdKpa !== null;
  const stageUnknown = evaluation.classification === "stage_unknown";
  const classification =
    trust.canCompareToStageTarget || stageUnknown ? evaluation.classification : "unverified";

  let statusLabel: string;
  let statusTone: DerivedVpdStatusViewModel["statusTone"];
  switch (classification) {
    case "in_band":
      statusLabel = "In target";
      statusTone = "ok";
      break;
    case "low":
      statusLabel = "Below target";
      statusTone = "warn";
      break;
    case "high":
      statusLabel = "Above target";
      statusTone = "warn";
      break;
    case "stage_unknown":
      statusLabel = "Stage unknown — no target check";
      statusTone = "muted";
      break;
    case "unverified":
      statusLabel = "Calibration required — no target claim";
      statusTone = "warn";
      break;
    case "unavailable":
    default:
      statusLabel = "VPD unavailable";
      statusTone = "unavailable";
      break;
  }

  if (!available) {
    statusLabel = "VPD unavailable";
    statusTone = "unavailable";
  }

  const targetBandLabel =
    trust.canCompareToStageTarget && evaluation.target
      ? `${evaluation.target.minKpa.toFixed(2)}–${evaluation.target.maxKpa.toFixed(2)} kPa`
      : null;

  const vpdLabel = trust.canCompareToStageTarget
    ? "Verified leaf VPD"
    : trust.basis === "leaf"
      ? "Leaf VPD estimate"
      : "Air VPD estimate";

  return {
    available,
    vpdKpa,
    classification,
    vpdLabel,
    statusLabel,
    statusTone,
    helpCopy: DERIVED_VPD_HELP_COPY,
    targetBandLabel,
    canCompareToStageTarget: trust.canCompareToStageTarget,
    confidence: trust.confidence,
    issues: trust.issues,
  };
}

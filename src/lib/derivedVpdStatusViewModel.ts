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

import { calculateAirVpdKpa } from "./vpdRules";
import {
  evaluateVpdAgainstStageTarget,
  type VpdTargetClassification,
} from "./vpdTargetRules";

export interface DerivedVpdStatusInput {
  airTempC?: number | string | null;
  airTempF?: number | string | null;
  humidityPct?: number | string | null;
  /** Optional grow stage. Unknown → no in-target language. */
  stage?: string | null;
}

export interface DerivedVpdStatusViewModel {
  /** True only when temp + RH produced a finite derived VPD. */
  available: boolean;
  /** Derived VPD in kPa, rounded by calculateAirVpdKpa. */
  vpdKpa: number | null;
  classification: VpdTargetClassification;
  /** UI label, always prefixed with "Derived". Never says "Live". */
  vpdLabel: string;
  /** Short status label, e.g. "In target", "Below target". */
  statusLabel: string;
  /** Tone hint for styling. */
  statusTone: "ok" | "warn" | "muted" | "unavailable";
  /** Help/tooltip copy. */
  helpCopy: string;
  /** Optional band copy from the matched target, e.g. "0.80–1.20 kPa". */
  targetBandLabel: string | null;
}

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const DERIVED_VPD_HELP_COPY =
  "VPD is calculated from air temperature and relative humidity.";

export function buildDerivedVpdStatusViewModel(
  input: DerivedVpdStatusInput,
): DerivedVpdStatusViewModel {
  const tempC = toFinite(input.airTempC);
  const tempF = toFinite(input.airTempF);
  const rh = toFinite(input.humidityPct);

  const vpdKpa = calculateAirVpdKpa({
    tempC: tempC ?? undefined,
    tempF: tempF ?? undefined,
    rhPercent: rh,
  });

  const evaluation = evaluateVpdAgainstStageTarget({
    vpdKpa,
    stage: input.stage ?? null,
  });

  const available = vpdKpa !== null;

  let statusLabel: string;
  let statusTone: DerivedVpdStatusViewModel["statusTone"];
  switch (evaluation.classification) {
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

  const targetBandLabel = evaluation.target
    ? `${evaluation.target.minKpa.toFixed(2)}–${evaluation.target.maxKpa.toFixed(2)} kPa`
    : null;

  return {
    available,
    vpdKpa,
    classification: evaluation.classification,
    vpdLabel: "Derived VPD",
    statusLabel,
    statusTone,
    helpCopy: DERIVED_VPD_HELP_COPY,
    targetBandLabel,
  };
}

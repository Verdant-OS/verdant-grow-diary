/**
 * actionOutcomeConfidenceRules — deterministic confidence model for the
 * Post-Action Outcome Analysis Engine.
 *
 * Score 0–100 from additive components, then HARD CAPS applied last so
 * no component mix can escape them:
 *
 *   demo-only evidence ............................ 0
 *   no follow-up AND short post-window ............ ≤ 40
 *   single pre + single post reading .............. ≤ 40
 *   any critical telemetry invalid ................ ≤ 50
 *   csv-only evidence ............................. ≤ 65
 *   manual-only evidence .......................... ≤ 70
 *
 * Bands: 0–39 low · 40–69 medium · 70–100 high.
 *
 * No randomness, no clock reads. Same input ⇒ same score.
 */

import type {
  ActionOutcomeEvidenceBundle,
  MetricOutcomeComparison,
} from "@/lib/actionOutcomeAnalysisTypes";
import { MIN_USEFUL_POST_WINDOW_HOURS } from "@/lib/actionOutcomeWindowRules";

export const CONFIDENCE_BANDS = {
  low: { min: 0, max: 39 },
  medium: { min: 40, max: 69 },
  high: { min: 70, max: 100 },
} as const;

export const CONFIDENCE_CAPS = {
  demoOnly: 0,
  noFollowUpShortWindow: 40,
  singlePairOfReadings: 40,
  invalidCriticalTelemetry: 50,
  csvOnly: 65,
  manualOnly: 70,
} as const;

export type ConfidenceInput = {
  bundle: ActionOutcomeEvidenceBundle;
  comparisons: MetricOutcomeComparison[];
  /** True when any critical metric row was rejected as invalid/implausible. */
  criticalTelemetryInvalid: boolean;
  /** True when ONLY demo-source rows were supplied (all rejected). */
  demoOnlyEvidence: boolean;
};

export type ConfidenceResult = {
  score: number;
  level: "low" | "medium" | "high";
  appliedCaps: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function confidenceLevelForScore(score: number): "low" | "medium" | "high" {
  if (score >= CONFIDENCE_BANDS.high.min) return "high";
  if (score >= CONFIDENCE_BANDS.medium.min) return "medium";
  return "low";
}

export function scoreActionOutcomeConfidence(input: ConfidenceInput): ConfidenceResult {
  const { bundle, comparisons } = input;
  const pre = bundle.preAction;
  const post = bundle.postAction;
  const appliedCaps: string[] = [];

  if (input.demoOnlyEvidence) {
    return { score: 0, level: "low", appliedCaps: ["demo_only_evidence"] };
  }

  // --- Additive components (each bounded; total bounded to 100) ---
  let score = 0;

  // Sample coverage: up to 15 per window (3 per usable sample).
  score += clamp(pre.metrics.length * 3, 0, 15);
  score += clamp(post.metrics.length * 3, 0, 15);

  // Source quality: best usable source present in either window.
  const sources = new Set([...pre.metrics, ...post.metrics].map((m) => m.source));
  if (sources.has("live")) score += 20;
  else if (sources.has("manual")) score += 14;
  else if (sources.has("csv")) score += 12;

  // Window duration: post-window hours up to 12 points (1/6h capped).
  score += clamp(Math.floor(post.elapsedHours / 6), 0, 12);

  // Target availability.
  if (bundle.growTargets && Object.keys(bundle.growTargets.bands).length > 0) {
    score += 10;
  }

  // Metric agreement: comparable metrics that share one direction.
  const comparable = comparisons.filter((c) => c.direction !== "not_comparable");
  if (comparable.length > 0) {
    const directions = new Set(comparable.map((c) => c.direction));
    score += directions.size === 1 ? 12 : 6;
  }

  // Grower follow-up availability.
  if (bundle.followUp && bundle.followUp.outcome) score += 8;

  // Missing-data penalty: -4 per missing item, up to -20.
  score -= clamp(bundle.missingInformation.length * 4, 0, 20);

  // Invalid/stale evidence penalty is folded into the critical cap and
  // the fact that such rows never reach the windows.

  score = clamp(Math.round(score), 0, 100);

  // --- Hard caps, applied after all components ---
  const usable = [...pre.metrics, ...post.metrics];
  const usableSources = new Set(usable.map((m) => m.source));

  const noFollowUp = !bundle.followUp || !bundle.followUp.outcome;
  const shortWindow = post.elapsedHours < MIN_USEFUL_POST_WINDOW_HOURS;
  if (noFollowUp && shortWindow) {
    score = Math.min(score, CONFIDENCE_CAPS.noFollowUpShortWindow);
    appliedCaps.push("no_follow_up_short_window");
  }

  if (pre.metrics.length === 1 && post.metrics.length === 1) {
    score = Math.min(score, CONFIDENCE_CAPS.singlePairOfReadings);
    appliedCaps.push("single_pair_of_readings");
  }

  if (input.criticalTelemetryInvalid) {
    score = Math.min(score, CONFIDENCE_CAPS.invalidCriticalTelemetry);
    appliedCaps.push("invalid_critical_telemetry");
  }

  if (usable.length > 0 && usableSources.size === 1) {
    if (usableSources.has("csv")) {
      score = Math.min(score, CONFIDENCE_CAPS.csvOnly);
      appliedCaps.push("csv_only_evidence");
    } else if (usableSources.has("manual")) {
      score = Math.min(score, CONFIDENCE_CAPS.manualOnly);
      appliedCaps.push("manual_only_evidence");
    }
  }

  return {
    score,
    level: confidenceLevelForScore(score),
    appliedCaps: [...appliedCaps].sort(),
  };
}

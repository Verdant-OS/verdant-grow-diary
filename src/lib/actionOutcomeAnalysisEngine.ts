/**
 * actionOutcomeAnalysisEngine — deterministic metric comparison,
 * overall classification, grower/system agreement, and conservative
 * learning guidance.
 *
 * Doctrine:
 *  - The grower-reported outcome is never rewritten. Disagreement is
 *    flagged respectfully, never adjudicated against the grower.
 *  - One reading never proves causation.
 *  - Tiny floating-point changes are not "improvement" — every metric
 *    has a centralized tolerance.
 *  - Count alone is not authoritative: critical environmental metrics
 *    (temperature, humidity, VPD) outweigh peripheral ones.
 *  - Nutrient success is never inferred from air-environment changes.
 *
 * Pure. No I/O, no clock reads, no React, no AI calls.
 */

import type {
  ActionOutcomeClassification,
  ActionOutcomeEvidenceBundle,
  EvidenceQuality,
  GrowerActionFollowUpOutcome,
  MetricDirection,
  MetricOutcomeComparison,
  NormalizedGrowTargets,
  NormalizedOutcomeMetric,
  OutcomeAgreement,
  OutcomeMetricName,
  OutcomeRiskLevel,
} from "@/lib/actionOutcomeAnalysisTypes";
import { MIN_USEFUL_POST_WINDOW_HOURS } from "@/lib/actionOutcomeWindowRules";

/**
 * Centralized per-metric tolerances (engine units). A pre→post move
 * smaller than the tolerance is "unchanged". Never inline these in UI.
 */
export const METRIC_TOLERANCES: Readonly<Record<OutcomeMetricName, number>> = {
  temperature_f: 1.5,
  humidity_pct: 3,
  vpd_kpa: 0.1,
  soil_moisture_pct: 5,
  soil_ec: 0.2,
  co2_ppm: 75,
  ppfd: 50,
  reservoir_ph: 0.2,
  reservoir_ec: 0.2,
};

/** Critical environmental metrics for V1 classification weighting. */
export const CRITICAL_OUTCOME_METRICS: readonly OutcomeMetricName[] = [
  "temperature_f",
  "humidity_pct",
  "vpd_kpa",
] as const;

/** Root-zone metrics: critical only when adequately sampled + valid. */
export const ROOT_ZONE_METRICS: readonly OutcomeMetricName[] = [
  "soil_moisture_pct",
  "soil_ec",
] as const;

/** Minimum samples per window for a root-zone metric to count as critical. */
export const ROOT_ZONE_CRITICAL_MIN_SAMPLES = 3;

/** Stable lexical metric ordering for all outputs. */
export const METRIC_ORDER: readonly OutcomeMetricName[] = [
  "co2_ppm",
  "humidity_pct",
  "ppfd",
  "reservoir_ec",
  "reservoir_ph",
  "soil_ec",
  "soil_moisture_pct",
  "temperature_f",
  "vpd_kpa",
] as const;

/** Deterministic median of a numeric list (average of middle pair). */
export function deterministicMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export type MetricAggregates = {
  median: number;
  min: number;
  max: number;
  sampleCount: number;
  firstValue: number;
  lastValue: number;
};

export function aggregateMetricSamples(
  samples: NormalizedOutcomeMetric[],
): MetricAggregates | null {
  if (samples.length === 0) return null;
  const ordered = [...samples].sort((a, b) =>
    a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : a.value - b.value,
  );
  const values = ordered.map((s) => s.value);
  const median = deterministicMedian(values);
  if (median === null) return null;
  return {
    median,
    min: Math.min(...values),
    max: Math.max(...values),
    sampleCount: values.length,
    firstValue: ordered[0].value,
    lastValue: ordered[ordered.length - 1].value,
  };
}

/**
 * Distance from a target band: 0 inside the band, else distance to the
 * nearest violated bound. Null when no usable band exists.
 */
export function targetDistance(
  value: number,
  band: { min: number | null; max: number | null } | undefined,
): number | null {
  if (!band) return null;
  const { min, max } = band;
  if (min === null && max === null) return null;
  if (min !== null && value < min) return min - value;
  if (max !== null && value > max) return value - max;
  return 0;
}

function qualityForSamples(
  pre: NormalizedOutcomeMetric[],
  post: NormalizedOutcomeMetric[],
): EvidenceQuality {
  if (pre.length === 0 || post.length === 0) return "unusable";
  const all = [...pre, ...post];
  const hasLive = all.some((m) => m.source === "live");
  const minSide = Math.min(pre.length, post.length);
  if (minSide >= 3 && hasLive) return "high";
  if (minSide >= 2) return "medium";
  return "low";
}

/** Compare one metric across the pre/post windows. */
export function compareMetric(input: {
  metric: OutcomeMetricName;
  preSamples: NormalizedOutcomeMetric[];
  postSamples: NormalizedOutcomeMetric[];
  targets: NormalizedGrowTargets | null;
}): MetricOutcomeComparison {
  const { metric } = input;
  const pre = aggregateMetricSamples(input.preSamples);
  const post = aggregateMetricSamples(input.postSamples);
  const band = input.targets?.bands[metric];
  const tolerance = METRIC_TOLERANCES[metric];

  const sampleCounts = {
    pre: input.preSamples.length,
    post: input.postSamples.length,
  };

  if (!pre || !post) {
    return {
      metric,
      preValue: pre?.median ?? null,
      postValue: post?.median ?? null,
      preTargetDistance: pre ? targetDistance(pre.median, band) : null,
      postTargetDistance: post ? targetDistance(post.median, band) : null,
      direction: "not_comparable",
      evidenceQuality: "unusable",
      sampleCounts,
      explanation: !pre
        ? `No usable pre-action ${metric} evidence.`
        : `No usable post-action ${metric} evidence.`,
    };
  }

  const preDistance = targetDistance(pre.median, band);
  const postDistance = targetDistance(post.median, band);
  const quality = qualityForSamples(input.preSamples, input.postSamples);

  let direction: MetricDirection;
  let explanation: string;

  if (preDistance !== null && postDistance !== null) {
    // Target-anchored comparison: what matters is distance to the band.
    const delta = preDistance - postDistance; // positive = moved closer
    if (Math.abs(delta) < tolerance) {
      direction = "unchanged";
      explanation = `${metric} stayed within tolerance of its previous distance to target (Δ ${delta.toFixed(2)} < ${tolerance}).`;
    } else if (delta > 0) {
      direction = "improved";
      explanation = `${metric} moved closer to the grow target (distance ${preDistance.toFixed(2)} → ${postDistance.toFixed(2)}).`;
    } else {
      direction = "declined";
      explanation = `${metric} moved farther from the grow target (distance ${preDistance.toFixed(2)} → ${postDistance.toFixed(2)}).`;
    }
  } else {
    // No target band: fall back to stability (median shift vs tolerance).
    const shift = Math.abs(post.median - pre.median);
    if (shift < tolerance) {
      direction = "unchanged";
      explanation = `${metric} median shift ${shift.toFixed(2)} is within tolerance ${tolerance}; no target band available.`;
    } else {
      // Without a target we cannot call a raw shift better or worse.
      direction = "not_comparable";
      explanation = `${metric} shifted by ${shift.toFixed(2)} but no grow target exists to judge direction.`;
    }
  }

  return {
    metric,
    preValue: pre.median,
    postValue: post.median,
    preTargetDistance: preDistance,
    postTargetDistance: postDistance,
    direction,
    evidenceQuality: quality,
    sampleCounts,
    explanation,
  };
}

/** Build comparisons for every metric present in either window. */
export function compareAllMetrics(bundle: ActionOutcomeEvidenceBundle): MetricOutcomeComparison[] {
  const present = new Set<OutcomeMetricName>();
  for (const m of bundle.preAction.metrics) present.add(m.metric);
  for (const m of bundle.postAction.metrics) present.add(m.metric);
  const ordered = METRIC_ORDER.filter((m) => present.has(m));
  return ordered.map((metric) =>
    compareMetric({
      metric,
      preSamples: bundle.preAction.metrics.filter((m) => m.metric === metric),
      postSamples: bundle.postAction.metrics.filter((m) => m.metric === metric),
      targets: bundle.growTargets,
    }),
  );
}

function isCriticalComparison(c: MetricOutcomeComparison): boolean {
  if ((CRITICAL_OUTCOME_METRICS as readonly string[]).includes(c.metric)) return true;
  if ((ROOT_ZONE_METRICS as readonly string[]).includes(c.metric)) {
    return (
      c.sampleCounts.pre >= ROOT_ZONE_CRITICAL_MIN_SAMPLES &&
      c.sampleCounts.post >= ROOT_ZONE_CRITICAL_MIN_SAMPLES &&
      c.evidenceQuality !== "unusable"
    );
  }
  return false;
}

/** Overall deterministic classification. */
export function classifyOutcome(input: {
  bundle: ActionOutcomeEvidenceBundle;
  comparisons: MetricOutcomeComparison[];
}): ActionOutcomeClassification {
  const { bundle, comparisons } = input;

  const preUsable = bundle.preAction.metrics.length;
  const postUsable = bundle.postAction.metrics.length;
  if (preUsable === 0 || postUsable === 0) return "insufficient_evidence";
  if (bundle.postAction.elapsedHours < MIN_USEFUL_POST_WINDOW_HOURS) {
    return "insufficient_evidence";
  }

  const comparable = comparisons.filter(
    (c) => c.direction !== "not_comparable" && c.evidenceQuality !== "unusable",
  );
  if (comparable.length === 0) return "insufficient_evidence";

  const critical = comparable.filter(isCriticalComparison);
  const improvedCritical = critical.filter((c) => c.direction === "improved");
  const declinedCritical = critical.filter((c) => c.direction === "declined");
  const improved = comparable.filter((c) => c.direction === "improved");
  const declined = comparable.filter((c) => c.direction === "declined");

  // Severity first: any critical decline blocks "improved".
  if (declinedCritical.length > 0 && improved.length > 0) return "mixed";
  if (declinedCritical.length > 0) return "declined";

  if (improved.length > 0 && declined.length > 0) return "mixed";
  if (improved.length > 0) {
    // Critical metrics must not contradict; peripheral-only improvement
    // still counts as improved when nothing declined.
    return improvedCritical.length > 0 || critical.length === 0 ? "improved" : "mixed";
  }
  if (declined.length > 0) return "declined";
  return "unchanged";
}

/** Risk level derived from classification + critical declines. */
export function deriveRiskLevel(
  classification: ActionOutcomeClassification,
  comparisons: MetricOutcomeComparison[],
): OutcomeRiskLevel {
  const criticalDeclined = comparisons.some(
    (c) => c.direction === "declined" && isCriticalComparison(c),
  );
  if (classification === "declined" && criticalDeclined) return "high";
  if (classification === "declined" || classification === "mixed") return "watch";
  if (classification === "insufficient_evidence") return "watch";
  return "low";
}

// ---------------------------------------------------------------------------
// Grower / system agreement
// ---------------------------------------------------------------------------

/**
 * Compare the system classification with the grower-selected outcome.
 * NEVER mutates or rewrites the grower's outcome.
 */
export function assessOutcomeAgreement(input: {
  growerOutcome: GrowerActionFollowUpOutcome | null;
  systemClassification: ActionOutcomeClassification;
}): OutcomeAgreement {
  const grower = input.growerOutcome;
  const system = input.systemClassification;
  if (grower === null) return "no_grower_outcome";

  switch (grower) {
    case "improved":
      if (system === "improved") return "agrees";
      if (system === "mixed" || system === "unchanged") return "partially_agrees";
      if (system === "declined") return "conflicts";
      return "not_comparable"; // insufficient_evidence
    case "declined":
      if (system === "declined") return "agrees";
      if (system === "mixed" || system === "unchanged") return "partially_agrees";
      if (system === "improved") return "conflicts";
      return "not_comparable";
    case "unchanged":
      if (system === "unchanged") return "agrees";
      if (system === "mixed") return "partially_agrees";
      if (system === "improved" || system === "declined") return "partially_agrees";
      return "not_comparable";
    case "too_soon":
      return system === "insufficient_evidence" ? "agrees" : "not_comparable";
    case "unclear":
      return system === "insufficient_evidence" ? "agrees" : "not_comparable";
  }
}

/** Respectful, cautious copy for each agreement state. */
export function agreementSummaryCopy(input: {
  agreement: OutcomeAgreement;
  growerOutcome: GrowerActionFollowUpOutcome | null;
  systemClassification: ActionOutcomeClassification;
}): string {
  const system = input.systemClassification.replace(/_/g, " ");
  switch (input.agreement) {
    case "agrees":
      return `The grower-reported outcome and the available evidence point the same way (${system}).`;
    case "partially_agrees":
      return `The grower reported ${input.growerOutcome ?? "an outcome"}, and the available evidence is ${system}. The signals overlap but do not fully align; more follow-up evidence would help.`;
    case "conflicts":
      return `The grower reported ${input.growerOutcome ?? "an outcome"}, but the available sensor evidence reads as ${system}. This is a flag for more evidence — not a judgment of the grower's observation.`;
    case "not_comparable":
      return `The grower-reported outcome and the system evidence cannot be directly compared for this run.`;
    case "no_grower_outcome":
      return `No grower-reported outcome has been recorded yet; only the system's evidence comparison is shown.`;
  }
}

// ---------------------------------------------------------------------------
// Learning guidance (rule-based copy — never an LLM)
// ---------------------------------------------------------------------------

export const GUIDANCE_COPY = {
  collectSnapshot: "Collect another follow-up snapshot.",
  repeatSimilar: "Repeat under similar conditions before drawing a conclusion.",
  noLargeChanges: "Do not make additional large changes yet.",
} as const;

/** Action types considered aggressive for repeat-guidance purposes. */
const AGGRESSIVE_ACTION_HINTS =
  /nutrient|feed|fertil|flush|irrigat|equipment|light\s*schedule|transplant/i;

export function deriveLearningGuidance(input: {
  classification: ActionOutcomeClassification;
  confidenceLevel: "low" | "medium" | "high";
  action: { actionType: string | null; suggestedChange: string | null; reason: string };
  comparisons: MetricOutcomeComparison[];
}): { repeatNextRun: string[]; avoidNextRun: string[]; cautions: string[] } {
  const repeatNextRun: string[] = [];
  const avoidNextRun: string[] = [];
  const cautions: string[] = [];

  const actionText = [
    input.action.actionType ?? "",
    input.action.suggestedChange ?? "",
    input.action.reason,
  ].join(" ");
  const aggressive = AGGRESSIVE_ACTION_HINTS.test(actionText);

  switch (input.classification) {
    case "improved": {
      if (input.confidenceLevel === "high" && !aggressive) {
        repeatNextRun.push(
          "This action was followed by measurable improvement under similar conditions; it is reasonable to try it again next run.",
        );
      } else {
        repeatNextRun.push(GUIDANCE_COPY.repeatSimilar);
      }
      cautions.push(
        "One improved run is not causal proof — conditions, timing, and unmeasured factors may differ next time.",
      );
      break;
    }
    case "declined": {
      const criticalDecline = input.comparisons.some(
        (c) => c.direction === "declined" && isCriticalComparison(c),
      );
      if (criticalDecline && input.confidenceLevel !== "low") {
        avoidNextRun.push(
          "Conditions moved away from target after this action; review it carefully before repeating it under similar conditions.",
        );
      }
      cautions.push(GUIDANCE_COPY.noLargeChanges);
      cautions.push(GUIDANCE_COPY.collectSnapshot);
      break;
    }
    case "mixed": {
      repeatNextRun.push(GUIDANCE_COPY.collectSnapshot);
      repeatNextRun.push(GUIDANCE_COPY.repeatSimilar);
      cautions.push(GUIDANCE_COPY.noLargeChanges);
      break;
    }
    case "unchanged": {
      repeatNextRun.push(GUIDANCE_COPY.collectSnapshot);
      cautions.push(
        "No meaningful change was measured; the action may need more time or the evidence window more coverage.",
      );
      break;
    }
    case "insufficient_evidence": {
      repeatNextRun.push(GUIDANCE_COPY.collectSnapshot);
      cautions.push(GUIDANCE_COPY.noLargeChanges);
      break;
    }
  }

  // Nutrient/irrigation/equipment repeats are never recommended from
  // air-environment-only evidence.
  if (aggressive) {
    const hasRootZoneEvidence = input.comparisons.some(
      (c) =>
        (ROOT_ZONE_METRICS as readonly string[]).includes(c.metric) &&
        c.direction !== "not_comparable",
    );
    if (!hasRootZoneEvidence) {
      const filtered = repeatNextRun.filter((line) => !line.includes("reasonable to try it again"));
      repeatNextRun.length = 0;
      repeatNextRun.push(...filtered);
      if (repeatNextRun.length === 0) repeatNextRun.push(GUIDANCE_COPY.repeatSimilar);
      cautions.push(
        "This action touches nutrients, irrigation, or equipment; air-environment evidence alone cannot confirm it worked. Collect root-zone or reservoir evidence before repeating.",
      );
    }
  }

  return {
    repeatNextRun: [...new Set(repeatNextRun)],
    avoidNextRun: [...new Set(avoidNextRun)],
    cautions: [...new Set(cautions)],
  };
}

export { isCriticalComparison };

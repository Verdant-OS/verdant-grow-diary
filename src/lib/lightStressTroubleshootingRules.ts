/**
 * lightStressTroubleshootingRules — pure, deterministic comparison support for
 * a grower reviewing possible lighting stress in the diary.
 *
 * This is not a diagnosis engine. It ranks visible/evidence patterns only,
 * keeps confidence capped at moderate, and always asks for the next useful
 * observations before a grower changes more than one variable.
 */

export type LightStressVisiblePattern =
  | "bleached_top"
  | "curled_crispy_top"
  | "whole_canopy_curl_droop"
  | "tip_first_across_levels"
  | "unknown";

export type LightStressLocationPattern =
  | "top_under_fixture"
  | "whole_canopy"
  | "tips_across_levels"
  | "unknown";

export interface LightStressTroubleshootingInput {
  readonly visiblePattern?: LightStressVisiblePattern | null;
  readonly locationPattern?: LightStressLocationPattern | null;
  readonly recentLightChange?: boolean | null;
  readonly highCanopyTemperature?: boolean | null;
  readonly ppfdOrDliAboveUsual?: boolean | null;
  readonly recentFeedOrEcChange?: boolean | null;
}

export type LightStressHypothesisId =
  | "bleaching_pattern"
  | "light_intensity_stress"
  | "heat_stress"
  | "feed_related_tip_burn";

export type LightStressSupportLevel = "more_supported" | "possible" | "not_enough_evidence";

export interface LightStressHypothesisComparison {
  readonly id: LightStressHypothesisId;
  readonly label: string;
  readonly support: LightStressSupportLevel;
  readonly reasons: readonly string[];
}

export interface LightStressTroubleshootingResult {
  readonly confidence: "low" | "moderate";
  readonly headline: string;
  readonly comparisons: readonly LightStressHypothesisComparison[];
  readonly nextDataToLog: readonly string[];
  readonly caution: string;
}

interface MutableCandidate {
  readonly id: LightStressHypothesisId;
  readonly label: string;
  readonly order: number;
  score: number;
  reasons: string[];
}

const CANDIDATES: ReadonlyArray<Pick<MutableCandidate, "id" | "label" | "order">> = [
  { id: "bleaching_pattern", label: "Bleaching pattern", order: 0 },
  {
    id: "light_intensity_stress",
    label: "Light-intensity stress",
    order: 1,
  },
  { id: "heat_stress", label: "Heat stress", order: 2 },
  {
    id: "feed_related_tip_burn",
    label: "Feed-related tip burn",
    order: 3,
  },
];

const CAUTION =
  "This comparison is not a diagnosis. Verify source and timing, avoid changing light, feed, and irrigation together, and use one small, reversible change at a time.";

function add(
  candidates: MutableCandidate[],
  id: LightStressHypothesisId,
  points: number,
  reason: string,
): void {
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) return;
  candidate.score += points;
  if (!candidate.reasons.includes(reason)) candidate.reasons.push(reason);
}

function prioritizedNextData(leader: LightStressHypothesisId | null): readonly string[] {
  const photo =
    "Same-angle photos of the top and middle canopy, with the affected tissue clearly framed.";
  const lightSetup =
    "Fixture model, dimmer setting, fixture-to-canopy distance, and the time of the last height or intensity change.";
  const lightMeasurement =
    "Center and edge PPFD at canopy height from a real meter, with source and captured time; keep PPFD unknown when it was not measured.";
  const environment =
    "Canopy air temperature, RH, and VPD from the same light period; add leaf temperature if a real reading is available.";
  const schedule =
    "Lights-on/off schedule and any recent photoperiod change, plus when the first symptom appeared.";
  const feed =
    "Recent feed strength, input/runoff EC when available, and whether tip damage appears across multiple canopy levels.";

  if (leader === "heat_stress") {
    return [environment, photo, lightSetup, schedule, lightMeasurement, feed];
  }
  if (leader === "feed_related_tip_burn") {
    return [feed, photo, environment, lightSetup, lightMeasurement, schedule];
  }
  return [photo, lightSetup, lightMeasurement, environment, schedule, feed];
}

export function evaluateLightStressEvidence(
  input: LightStressTroubleshootingInput | null | undefined,
): LightStressTroubleshootingResult {
  const candidates: MutableCandidate[] = CANDIDATES.map((candidate) => ({
    ...candidate,
    score: 0,
    reasons: [],
  }));
  const value = input ?? {};

  switch (value.visiblePattern ?? "unknown") {
    case "bleached_top":
      add(
        candidates,
        "bleaching_pattern",
        5,
        "Pale or white top tissue matches a bleaching observation.",
      );
      add(
        candidates,
        "light_intensity_stress",
        2,
        "Top bleaching can accompany excess light intensity.",
      );
      break;
    case "curled_crispy_top":
      add(
        candidates,
        "light_intensity_stress",
        5,
        "Curling or crisping concentrated at the top fits a light-intensity pattern.",
      );
      add(
        candidates,
        "heat_stress",
        1,
        "Heat can also contribute to top-leaf curling or crisping.",
      );
      break;
    case "whole_canopy_curl_droop":
      add(
        candidates,
        "heat_stress",
        5,
        "Curl or droop across the canopy fits a room-heat pattern better than one hot spot.",
      );
      add(
        candidates,
        "light_intensity_stress",
        1,
        "A broad high-intensity footprint can overlap with heat symptoms.",
      );
      break;
    case "tip_first_across_levels":
      add(
        candidates,
        "feed_related_tip_burn",
        5,
        "Tip-first damage across canopy levels fits a feed or EC comparison.",
      );
      break;
    case "unknown":
      break;
  }

  switch (value.locationPattern ?? "unknown") {
    case "top_under_fixture":
      add(candidates, "bleaching_pattern", 2, "The pattern is strongest in fixture-facing tissue.");
      add(
        candidates,
        "light_intensity_stress",
        2,
        "The pattern is strongest at the canopy top or under the beam.",
      );
      break;
    case "whole_canopy":
      add(candidates, "heat_stress", 2, "The symptom spans the canopy rather than one beam area.");
      break;
    case "tips_across_levels":
      add(
        candidates,
        "feed_related_tip_burn",
        2,
        "Leaf tips are affected across more than one canopy level.",
      );
      break;
    case "unknown":
      break;
  }

  if (value.recentLightChange === true) {
    add(
      candidates,
      "light_intensity_stress",
      3,
      "A recent height, dimmer, or schedule change provides timing evidence.",
    );
    add(
      candidates,
      "bleaching_pattern",
      2,
      "Bleaching appeared in the context of a recent lighting change.",
    );
  }
  if (value.highCanopyTemperature === true) {
    add(
      candidates,
      "heat_stress",
      4,
      "A high canopy or leaf-temperature reading supports heat stress.",
    );
  }
  if (value.ppfdOrDliAboveUsual === true) {
    add(
      candidates,
      "light_intensity_stress",
      3,
      "Measured PPFD or calculated DLI is above the plant's recent baseline.",
    );
    add(
      candidates,
      "bleaching_pattern",
      2,
      "Higher measured light supports checking a bleaching pattern.",
    );
  }
  if (value.recentFeedOrEcChange === true) {
    add(
      candidates,
      "feed_related_tip_burn",
      4,
      "A recent feed-strength or EC change supports the tip-burn alternative.",
    );
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  const topScore = candidates[0]?.score ?? 0;
  const secondScore = candidates[1]?.score ?? 0;
  const leader = topScore > 0 ? (candidates[0]?.id ?? null) : null;
  const confidence = topScore >= 7 && topScore - secondScore >= 2 ? "moderate" : "low";

  const comparisons = candidates.map<LightStressHypothesisComparison>((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    support:
      topScore === 0
        ? "not_enough_evidence"
        : candidate.score === topScore
          ? "more_supported"
          : candidate.score > 0
            ? "possible"
            : "not_enough_evidence",
    reasons: candidate.reasons,
  }));

  return {
    confidence,
    headline:
      topScore === 0
        ? "Not enough evidence to rank the patterns yet."
        : `Current evidence most supports comparing: ${candidates[0]?.label ?? "unknown"}.`,
    comparisons,
    nextDataToLog: prioritizedNextData(leader),
    caution: CAUTION,
  };
}

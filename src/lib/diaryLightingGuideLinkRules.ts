/**
 * diaryLightingGuideLinkRules — pure, high-precision matching for contextual
 * grow-light help on Operator Mode diary rows.
 *
 * The rule only reads the already-clipped note preview, public tags/event type,
 * and closed-set Quick Log detail codes. It never reads raw detail JSON, writes
 * data, calls AI, or treats a keyword as a diagnosis.
 */

import {
  CANNABIS_LIGHTING_FAQ,
  CANNABIS_LIGHTING_GUIDE_PATH,
} from "@/constants/cannabisPlantCareFaq";

export type DiaryLightingGuideTopic = "distance_intensity" | "ppfd_dli" | "schedule" | "stress";

export interface DiaryLightingGuideLinkInput {
  readonly eventType?: string | null;
  readonly tags?: readonly string[] | null;
  readonly notePreview?: string | null;
  readonly observedSign?: string | null;
  readonly observationLocation?: string | null;
  readonly environmentCheckType?: string | null;
}

export interface DiaryLightingGuideLink {
  readonly href: string;
  readonly question: string;
  readonly matchedTopic: DiaryLightingGuideTopic;
  readonly faqIndex: number;
  /** Stress evidence earns the in-diary comparison flow; setup notes do not. */
  readonly offersTroubleshooter: boolean;
}

const TOPIC_TO_FAQ_INDEX: Readonly<Record<DiaryLightingGuideTopic, number>> = {
  distance_intensity: 0,
  ppfd_dli: 1,
  schedule: 2,
  stress: 3,
};

const STRESS_PATTERN =
  /\b(?:light[\s-]?(?:burn|stress)|heat[\s-]?stress|photo[\s-]?bleach(?:ed|ing)?|bleach(?:ed|ing)?|taco(?:ing)?|canoe(?:ing)?|scorch(?:ed|ing)?)\b/i;
const SCHEDULE_PATTERN =
  /\b(?:photoperiod|autoflower(?:ing)?|light[\s-]?schedule|lights?\s+(?:on|off)|flower(?:ing)?\s+flip)\b|(?:12\s*\/\s*12|18\s*\/\s*6|20\s*\/\s*4)/i;
const PPFD_DLI_PATTERN =
  /\b(?:ppfd|daily[\s-]?light[\s-]?integral|dli|quantum[\s-]?sensor|canopy[\s-]?map)\b/i;
const DISTANCE_INTENSITY_PATTERN =
  /\b(?:grow[\s-]?light|light[\s-]?intensity|hanging[\s-]?distance|fixture|dimmer|fixture[\s-]?height|light[\s-]?height)\b/i;

const LIGHTING_TAGS = new Set(["lighting", "light-stress", "grow-light"]);
const LIGHTING_EVENT_TYPES = new Set(["lighting", "light_check", "light-stress"]);
const STRUCTURED_STRESS_SIGNS = new Set(["bleached_tissue", "upward_curling"]);
const UPPER_GROWTH_STRESS_SIGNS = new Set(["discoloration", "curling", "crispy_edges"]);

function normalized(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Detect the lighting topic without turning generic words such as "burn",
 * "light watering", or "hot" into a lighting claim.
 */
export function detectDiaryLightingGuideTopic(
  input: DiaryLightingGuideLinkInput,
): DiaryLightingGuideTopic | null {
  const note = normalized(input.notePreview);
  const sign = normalized(input.observedSign);
  const location = normalized(input.observationLocation);
  const checkType = normalized(input.environmentCheckType);
  const eventType = normalized(input.eventType);
  const tags = new Set((input.tags ?? []).map(normalized).filter(Boolean));

  if (
    (note && STRESS_PATTERN.test(note)) ||
    STRUCTURED_STRESS_SIGNS.has(sign) ||
    (location === "upper_growth" && UPPER_GROWTH_STRESS_SIGNS.has(sign))
  ) {
    return "stress";
  }
  if (note && SCHEDULE_PATTERN.test(note)) return "schedule";
  if (note && PPFD_DLI_PATTERN.test(note)) return "ppfd_dli";
  if (
    (note && DISTANCE_INTENSITY_PATTERN.test(note)) ||
    checkType === "light" ||
    LIGHTING_EVENT_TYPES.has(eventType) ||
    [...LIGHTING_TAGS].some((tag) => tags.has(tag))
  ) {
    return "distance_intensity";
  }
  return null;
}

export function buildDiaryLightingGuideLink(
  input: DiaryLightingGuideLinkInput,
): DiaryLightingGuideLink | null {
  const topic = detectDiaryLightingGuideTopic(input);
  if (!topic) return null;
  const faqIndex = TOPIC_TO_FAQ_INDEX[topic];
  const faq = CANNABIS_LIGHTING_FAQ[faqIndex];
  if (!faq) return null;
  return {
    href: `${CANNABIS_LIGHTING_GUIDE_PATH}#faq-${faqIndex}`,
    question: faq.question,
    matchedTopic: topic,
    faqIndex,
    offersTroubleshooter: topic === "stress",
  };
}

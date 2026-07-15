/**
 * diaryFaqLinkRules — pure rule that maps a diary timeline item to a
 * contextual "Related FAQ" link into the public Cannabis Plant Care FAQ
 * guide when the entry's tags, event type, or note preview mentions a
 * common symptom or care topic (e.g. yellow leaves, environment issues,
 * watering, feeding, harvest).
 *
 * Presenter-only wiring: this helper never writes, calls AI, hits the
 * network, or exposes private payloads. It only inspects public,
 * already-clipped fields on the timeline item (tags, eventType,
 * notePreview) and returns a route + label the UI can render.
 *
 * The link routes to `/guides/cannabis-plant-care#faq-<index>` — same
 * anchor scheme that GuidePage renders for its FAQ accordion items.
 *
 * Cultivation-guidance rules apply: we do not diagnose. We only offer
 * a "read more" pointer into the shared FAQ content.
 */

import { CANNABIS_PLANT_CARE_FAQ } from "@/constants/cannabisPlantCareFaq";

export interface DiaryFaqLinkInput {
  readonly eventType?: string | null;
  readonly tags?: readonly string[] | null;
  readonly notePreview?: string | null;
}

export interface DiaryFaqLink {
  /** 0-based index into CANNABIS_PLANT_CARE_FAQ. */
  readonly faqIndex: number;
  /** Route with hash anchor, e.g. "/guides/cannabis-plant-care#faq-2". */
  readonly href: string;
  /** Full question text, used as the visible link label. */
  readonly question: string;
  /** Short reason keyword the UI can surface as context. */
  readonly matchedTopic: DiaryFaqTopic;
}

export type DiaryFaqTopic =
  | "yellowing"
  | "environment"
  | "watering"
  | "nutrients"
  | "harvest";

/**
 * FAQ index in CANNABIS_PLANT_CARE_FAQ:
 *   0 — How often should I water a cannabis plant?
 *   1 — What nutrients should I give my cannabis plant?
 *   2 — Why are my cannabis leaves turning yellow?
 *   3 — What temperature and humidity should a cannabis grow room have?
 *   4 — How do I know when to harvest cannabis?
 */
const TOPIC_TO_FAQ_INDEX: Record<DiaryFaqTopic, number> = {
  watering: 0,
  nutrients: 1,
  yellowing: 2,
  environment: 3,
  harvest: 4,
};

/** Word-boundary regex for a keyword list. Case-insensitive. */
function keywordRegex(words: readonly string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "i");
}

const TOPIC_MATCHERS: ReadonlyArray<{
  topic: DiaryFaqTopic;
  regex: RegExp;
  tagMatches: readonly string[];
  eventTypeMatches: readonly string[];
}> = [
  {
    topic: "yellowing",
    regex: keywordRegex([
      "yellow",
      "yellowing",
      "chlorosis",
      "chlorotic",
      "pale leaves",
    ]),
    tagMatches: [],
    eventTypeMatches: [],
  },
  {
    topic: "environment",
    regex: keywordRegex([
      "temperature",
      "temp",
      "humidity",
      "rh",
      "vpd",
      "heat",
      "hot",
      "cold",
      "chilly",
      "stuffy",
      "condensation",
    ]),
    tagMatches: [],
    eventTypeMatches: ["environment"],
  },
  {
    topic: "watering",
    regex: keywordRegex([
      "water",
      "watering",
      "overwater",
      "overwatered",
      "underwater",
      "underwatered",
      "drought",
      "wilt",
      "wilting",
      "runoff",
    ]),
    tagMatches: ["watering"],
    eventTypeMatches: ["watering"],
  },
  {
    topic: "nutrients",
    regex: keywordRegex([
      "nutrient",
      "nutrients",
      "nitrogen",
      "phosphorus",
      "potassium",
      "deficiency",
      "deficient",
      "nute",
      "nutes",
      "burn",
      "lockout",
      "ec",
      "ppm",
      "feed",
      "feeding",
    ]),
    tagMatches: ["feeding", "nutrient"],
    eventTypeMatches: ["feeding"],
  },
  {
    topic: "harvest",
    regex: keywordRegex([
      "harvest",
      "trichome",
      "trichomes",
      "pistil",
      "pistils",
      "amber",
      "milky",
      "chop",
    ]),
    tagMatches: [],
    eventTypeMatches: ["harvest"],
  },
];

/**
 * Priority order when multiple topics match. Symptom-driven topics beat
 * generic activity tags so a "watering — leaves yellow and wilting"
 * entry links to the yellowing FAQ, not the generic watering one.
 */
const TOPIC_PRIORITY: readonly DiaryFaqTopic[] = [
  "yellowing",
  "environment",
  "harvest",
  "nutrients",
  "watering",
];

/**
 * Detect the most relevant FAQ topic for a diary timeline item.
 * Text matches (notePreview) take precedence over tag/eventType-only
 * matches so activity-only entries still get a helpful link.
 */
export function detectDiaryFaqTopic(
  input: DiaryFaqLinkInput,
): DiaryFaqTopic | null {
  const note = (input.notePreview ?? "").trim();
  const tags = input.tags ?? [];
  const eventType = (input.eventType ?? "").trim().toLowerCase();

  const textMatches = new Set<DiaryFaqTopic>();
  const structuralMatches = new Set<DiaryFaqTopic>();

  for (const m of TOPIC_MATCHERS) {
    if (note && m.regex.test(note)) {
      textMatches.add(m.topic);
      continue;
    }
    const tagHit = m.tagMatches.some((t) => tags.includes(t));
    const eventHit =
      eventType.length > 0 && m.eventTypeMatches.includes(eventType);
    if (tagHit || eventHit) {
      structuralMatches.add(m.topic);
    }
  }

  for (const topic of TOPIC_PRIORITY) {
    if (textMatches.has(topic)) return topic;
  }
  for (const topic of TOPIC_PRIORITY) {
    if (structuralMatches.has(topic)) return topic;
  }
  return null;
}

/**
 * Build a contextual FAQ link for a diary timeline item, or null if no
 * common topic matches. The returned href is a same-app route with a
 * hash anchor that GuidePage's FAQ accordion recognizes.
 */
export function buildDiaryFaqLink(
  input: DiaryFaqLinkInput,
): DiaryFaqLink | null {
  const topic = detectDiaryFaqTopic(input);
  if (!topic) return null;
  const faqIndex = TOPIC_TO_FAQ_INDEX[topic];
  const entry = CANNABIS_PLANT_CARE_FAQ[faqIndex];
  if (!entry) return null;
  return {
    faqIndex,
    href: `/guides/cannabis-plant-care#faq-${faqIndex}`,
    question: entry.question,
    matchedTopic: topic,
  };
}

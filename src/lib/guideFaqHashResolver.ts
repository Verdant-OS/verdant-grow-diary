/**
 * guideFaqHashResolver — pure helper that maps a URL hash to an FAQ
 * accordion value (e.g. "faq-2") for a given SEO guide.
 *
 * Presenter-only. No network, no writes, no AI. Used by GuidePage so
 * deep links from the diary, external tools, or share URLs can target a
 * specific FAQ item via either:
 *
 *   - #faq-<index>         Positional (backwards compatible)
 *   - #topic-<topic>       Topic slug (cannabis-plant-care topics)
 *   - #<question-slug>     Kebab-case slug derived from the question text
 *
 * The resolver returns undefined when nothing matches so the accordion
 * simply stays closed rather than opening the wrong item.
 */
import type { SeoGuidePage } from "@/constants/verdantSeoContent";
import type { FaqEntry } from "@/constants/verdantSeoCopy";

/** Topic slugs supported for the cannabis-plant-care guide. Matches
 * diaryFaqLinkRules' DiaryFaqTopic → FAQ index mapping so a diary link
 * of `#topic-yellowing` opens the yellow-leaves question. */
const CANNABIS_PLANT_CARE_TOPIC_INDEX: Readonly<Record<string, number>> = {
  watering: 0,
  nutrients: 1,
  yellowing: 2,
  environment: 3,
  harvest: 4,
};

/** Kebab-case a question string for use as a hash slug. Deterministic
 * and null-safe: strips punctuation, collapses whitespace, and trims
 * leading/trailing separators. */
export function slugifyFaqQuestion(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalise a raw hash: strip leading "#" and lowercase. */
function normaliseHash(rawHash: string | null | undefined): string {
  if (!rawHash) return "";
  return rawHash.replace(/^#/, "").trim().toLowerCase();
}

export interface ResolvedGuideFaq {
  /** Accordion value, e.g. "faq-2". Safe to pass to Radix Accordion. */
  readonly value: string;
  /** 0-based index into guide.faq. */
  readonly index: number;
  /** How the hash was matched, useful for tests and debugging. */
  readonly matchedBy: "index" | "topic" | "question-slug";
}

/**
 * Resolve a hash against a guide's FAQ list. Returns null when the
 * hash doesn't correspond to any question so callers can leave the
 * accordion closed instead of guessing.
 */
export function resolveGuideFaqFromHash(
  guide: Pick<SeoGuidePage, "slug" | "faq"> | null | undefined,
  rawHash: string | null | undefined,
): ResolvedGuideFaq | null {
  if (!guide) return null;
  const hash = normaliseHash(rawHash);
  if (!hash) return null;
  const faq = guide.faq ?? [];
  if (faq.length === 0) return null;

  // 1. Positional #faq-<n>
  const faqMatch = /^faq-(\d+)$/.exec(hash);
  if (faqMatch) {
    const idx = Number.parseInt(faqMatch[1] ?? "", 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < faq.length) {
      return { value: `faq-${idx}`, index: idx, matchedBy: "index" };
    }
    return null;
  }

  // 2. Topic slug #topic-<topic> (guide-specific mapping)
  const topicMatch = /^topic-([a-z0-9-]+)$/.exec(hash);
  if (topicMatch) {
    const topic = topicMatch[1] ?? "";
    if (guide.slug === "cannabis-plant-care") {
      const idx = CANNABIS_PLANT_CARE_TOPIC_INDEX[topic];
      if (typeof idx === "number" && idx < faq.length) {
        return { value: `faq-${idx}`, index: idx, matchedBy: "topic" };
      }
    }
    return null;
  }

  // 3. Question slug — match by slugified question text.
  const idx = faq.findIndex(
    (entry: FaqEntry) => slugifyFaqQuestion(entry.question) === hash,
  );
  if (idx >= 0) {
    return { value: `faq-${idx}`, index: idx, matchedBy: "question-slug" };
  }

  return null;
}

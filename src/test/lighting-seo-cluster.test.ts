import { describe, expect, it } from "vitest";
import {
  CANNABIS_LIGHTING_FAQ,
  CANNABIS_LIGHTING_SETUP_FAQ,
  CANNABIS_LIGHT_STRESS_FAQ,
  CANNABIS_PLANT_CARE_FAQ,
} from "@/constants/cannabisPlantCareFaq";
import { findGuideBySlug, VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import { buildArticleJsonLd, buildFaqPageJsonLd } from "@/lib/seoStructuredData";

const SETUP_SLUG = "cannabis-grow-light-distance-and-schedule";
const STRESS_SLUG = "cannabis-light-stress-light-burn-bleaching-or-heat";
const LIGHTING_SLUGS = new Set([SETUP_SLUG, STRESS_SLUG]);
const LIGHTING_PATHS = new Set([...LIGHTING_SLUGS].map((slug) => `/guides/${slug}`));
const OPTIMIZED_EXISTING_SLUGS = [
  "grow-room-vpd-tracker",
  "sensor-truth-grow-room",
  "cannabis-plant-care",
  "what-to-log-in-a-grow-journal",
  "daily-grow-log-checklist",
] as const;
const EXPECTED_MODIFIED_ON_BY_SLUG: Record<(typeof OPTIMIZED_EXISTING_SLUGS)[number], string> = {
  "grow-room-vpd-tracker": "2026-08-02",
  "sensor-truth-grow-room": "2026-08-02",
  "cannabis-plant-care": "2026-07-30",
  "what-to-log-in-a-grow-journal": "2026-07-30",
  "daily-grow-log-checklist": "2026-07-30",
};

function requiredGuide(slug: string) {
  const guide = findGuideBySlug(slug);
  if (!guide) throw new Error(`missing guide: ${slug}`);
  return guide;
}

describe("indoor cannabis lighting SEO cluster", () => {
  it("publishes the setup and troubleshooting pages from the shared guide registry", () => {
    const setup = requiredGuide(SETUP_SLUG);
    const stress = requiredGuide(STRESS_SLUG);

    expect(setup.targetKeyword).toBe("cannabis grow light distance");
    expect(stress.targetKeyword).toBe("cannabis light stress");
    expect(setup.sections).toHaveLength(5);
    expect(stress.sections).toHaveLength(5);
    expect(setup.publishedOn).toBe("2026-07-30");
    expect(stress.publishedOn).toBe("2026-07-30");
  });

  it("uses the shared visible FAQ entries as the exact FAQPage JSON-LD source", () => {
    const setup = requiredGuide(SETUP_SLUG);
    const stress = requiredGuide(STRESS_SLUG);

    expect(setup.faq).toBe(CANNABIS_LIGHTING_SETUP_FAQ);
    expect(stress.faq).toBe(CANNABIS_LIGHT_STRESS_FAQ);

    for (const guide of [setup, stress]) {
      const schema = buildFaqPageJsonLd({
        pageUrl: `https://verdantgrowdiary.com/guides/${guide.slug}`,
        questions: guide.faq,
      });
      expect(schema.mainEntity.map((entry) => entry.name)).toEqual(
        guide.faq.map((entry) => entry.question),
      );
      expect(schema.mainEntity.map((entry) => entry.acceptedAnswer.text)).toEqual(
        guide.faq.map((entry) => entry.answer),
      );
    }
  });

  it("appends all lighting questions to plant care without moving the yellow-leaf contract", () => {
    expect(CANNABIS_PLANT_CARE_FAQ[2].question).toMatch(/leaves turning yellow/i);
    expect(CANNABIS_LIGHTING_FAQ).toEqual([
      ...CANNABIS_LIGHTING_SETUP_FAQ,
      ...CANNABIS_LIGHT_STRESS_FAQ,
    ]);
    expect(CANNABIS_PLANT_CARE_FAQ.slice(-CANNABIS_LIGHTING_FAQ.length)).toEqual(
      CANNABIS_LIGHTING_FAQ,
    );
  });

  it("materially refreshes five existing pages and points each into both lighting guides", () => {
    for (const slug of OPTIMIZED_EXISTING_SLUGS) {
      const guide = requiredGuide(slug);
      const sectionTargets = new Set(
        guide.sections.flatMap((section) => section.links?.map((link) => link.to) ?? []),
      );

      expect(guide.modifiedOn).toBe(EXPECTED_MODIFIED_ON_BY_SLUG[slug]);
      expect(guide.sections).toHaveLength(5);
      expect(sectionTargets.size).toBeGreaterThanOrEqual(2);
      expect(guide.sources?.length).toBeGreaterThanOrEqual(1);
      expect(sectionTargets.has(`/guides/${SETUP_SLUG}`)).toBe(true);
      expect(sectionTargets.has(`/guides/${STRESS_SLUG}`)).toBe(true);
    }
  });

  it("adds at least twenty unique, contextual source-to-target links around the cluster", () => {
    const contextualPairs = new Set<string>();

    for (const guide of VERDANT_SEO_GUIDES) {
      const sourceIsLighting = LIGHTING_SLUGS.has(guide.slug);
      for (const section of guide.sections) {
        for (const link of section.links ?? []) {
          if (sourceIsLighting || LIGHTING_PATHS.has(link.to)) {
            contextualPairs.add(`${guide.slug}->${link.to}`);
          }
        }
      }
      for (const relatedSlug of guide.related) {
        if (sourceIsLighting || LIGHTING_SLUGS.has(relatedSlug)) {
          contextualPairs.add(`${guide.slug}->/guides/${relatedSlug}`);
        }
      }
    }

    expect(contextualPairs.size).toBeGreaterThanOrEqual(20);
  });

  it("shows scoped HTTPS research sources instead of presenting universal targets", () => {
    for (const slug of LIGHTING_SLUGS) {
      const guide = requiredGuide(slug);
      expect(guide.sources?.length).toBeGreaterThanOrEqual(2);
      for (const source of guide.sources ?? []) {
        expect(source.href).toMatch(/^https:\/\//);
        expect(source.note.length).toBeGreaterThan(40);
        expect(source.note).toMatch(/not|does not/i);
      }
    }

    const copy = JSON.stringify([...LIGHTING_SLUGS].map(requiredGuide));
    expect(copy).toMatch(/not a target|not a universal|not a diagnosis/i);
    expect(copy).not.toMatch(
      /guaranteed|perfect ppfd|ideal for every|diagnos(?:e|is) from one photo/i,
    );
  });

  it("requires a verified Article publication date and preserves it when supplied", () => {
    const dated = buildArticleJsonLd({
      headline: "Dated guide",
      description: "A guide with repository-backed publication provenance.",
      url: "https://verdantgrowdiary.com/guides/dated",
      datePublished: "2026-07-30",
      dateModified: "2026-07-30",
    });
    expect(dated.datePublished).toBe("2026-07-30");
    expect(dated.dateModified).toBe("2026-07-30");
    expect(() =>
      buildArticleJsonLd({
        headline: "Bad publication date",
        description: "Bad publication date regression.",
        url: "https://verdantgrowdiary.com/guides/bad-publication-date",
        datePublished: "sometime",
      }),
    ).toThrow(/datePublished must be ISO-8601/);
    expect(() =>
      buildArticleJsonLd({
        headline: "Bad date",
        description: "Bad date regression.",
        url: "https://verdantgrowdiary.com/guides/bad-date",
        datePublished: "2026-07-30",
        dateModified: "yesterday",
      }),
    ).toThrow(/dateModified must be ISO-8601/);
  });
});

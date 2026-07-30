import { describe, expect, it } from "vitest";
import {
  CANNABIS_LIGHTING_FAQ,
  CANNABIS_LIGHTING_GUIDE_PATH,
  CANNABIS_LIGHTING_GUIDE_SLUG,
  CANNABIS_PLANT_CARE_FAQ,
} from "@/constants/cannabisPlantCareFaq";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { buildFaqPageJsonLd } from "@/lib/seoStructuredData";

describe("shared cannabis lighting FAQ", () => {
  it("adds four evidence-shaped lighting questions to the shared care FAQ", () => {
    expect(CANNABIS_LIGHTING_FAQ).toHaveLength(4);
    expect(CANNABIS_PLANT_CARE_FAQ).toHaveLength(9);
    for (const entry of CANNABIS_LIGHTING_FAQ) {
      expect(CANNABIS_PLANT_CARE_FAQ).toContain(entry);
      expect(entry.question.trim()).not.toBe("");
      expect(entry.answer.length).toBeGreaterThan(80);
    }
    const questions = CANNABIS_LIGHTING_FAQ.map((entry) => entry.question).join(" ");
    expect(questions).toMatch(/LED grow light/i);
    expect(questions).toMatch(/PPFD and DLI/i);
    expect(questions).toMatch(/autoflower/i);
    expect(questions).toMatch(/light burn, bleaching, and heat stress/i);
  });

  it("keeps lighting answers cautious and measurement-honest", () => {
    const copy = JSON.stringify(CANNABIS_LIGHTING_FAQ);
    expect(copy).toMatch(/no universal hanging distance/i);
    expect(copy).toMatch(/real meter/i);
    expect(copy).toMatch(/do not need a 12\/12 flip/i);
    expect(copy).toMatch(/hypotheses, not a diagnosis/i);
    expect(copy).not.toMatch(/controls? (?:the |your )?(?:light|equipment)/i);
  });
});

describe("cannabis grow-light distance and schedule guide", () => {
  const guide = findGuideBySlug(CANNABIS_LIGHTING_GUIDE_SLUG);

  it("publishes the exact route with PPFD, DLI, schedules, and stress coverage", () => {
    expect(CANNABIS_LIGHTING_GUIDE_PATH).toBe("/guides/cannabis-grow-light-distance-and-schedule");
    expect(guide).not.toBeNull();
    expect(guide?.targetKeyword).toBe("grow light distance from plants");
    expect(guide?.faq).toBe(CANNABIS_LIGHTING_FAQ);

    const copy = JSON.stringify(guide);
    for (const required of [
      /PPFD/i,
      /DLI/i,
      /18\/6/i,
      /20\/4/i,
      /12\/12/i,
      /autoflower/i,
      /bleaching/i,
      /heat stress/i,
      /source-labeled/i,
    ]) {
      expect(copy).toMatch(required);
    }
  });

  it("derives valid FAQPage JSON-LD from the same visible FAQ entries", () => {
    if (!guide) throw new Error("lighting guide missing");
    const jsonLd = buildFaqPageJsonLd({
      pageUrl: `https://verdantgrowdiary.com${CANNABIS_LIGHTING_GUIDE_PATH}`,
      questions: guide.faq,
    });
    expect(jsonLd["@type"]).toBe("FAQPage");
    expect(jsonLd.mainEntity).toHaveLength(CANNABIS_LIGHTING_FAQ.length);
    expect(jsonLd.mainEntity[0]?.name).toBe(CANNABIS_LIGHTING_FAQ[0]?.question);
  });

  it("emits a static crawler document with FAQPage and Article schema", () => {
    const document = STATIC_PUBLIC_SEO_DOCUMENTS.find(
      (candidate) => candidate.path === CANNABIS_LIGHTING_GUIDE_PATH,
    );
    expect(document).toBeDefined();
    const types = (document?.metadata.jsonLd ?? []).flatMap((block) => {
      if (!block || typeof block !== "object" || !("@type" in block)) return [];
      return [String(block["@type"])];
    });
    expect(types).toEqual(
      expect.arrayContaining(["WebPage", "FAQPage", "BreadcrumbList", "Article"]),
    );
  });
});

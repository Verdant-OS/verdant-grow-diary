/**
 * verdant-seo-structured-data.test.ts
 *
 * Unit tests for the pure JSON-LD builders in src/lib/seoStructuredData.ts,
 * plus an integration assertion that the FAQPage schema built for the
 * landing page matches the visible landing FAQ 1:1.
 */
import { describe, expect, it } from "vitest";
import {
  buildFaqPageJsonLd,
  buildSoftwareApplicationJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";
import { VERDANT_LANDING_FAQ } from "@/constants/verdantSeoCopy";

describe("buildFaqPageJsonLd", () => {
  it("produces a valid schema.org FAQPage envelope", () => {
    const doc = buildFaqPageJsonLd({
      pageUrl: "https://example.com/",
      questions: [{ question: "Q1?", answer: "A1." }],
    });
    expect(doc["@context"]).toBe("https://schema.org");
    expect(doc["@type"]).toBe("FAQPage");
    expect(doc.url).toBe("https://example.com/");
    expect(doc.mainEntity).toHaveLength(1);
    expect(doc.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "Q1?",
      acceptedAnswer: { "@type": "Answer", text: "A1." },
    });
  });

  it("throws on empty question list", () => {
    expect(() => buildFaqPageJsonLd({ questions: [] })).toThrow();
  });

  it("throws when any answer is empty (no hidden/blank FAQ schema)", () => {
    expect(() =>
      buildFaqPageJsonLd({
        questions: [{ question: "Q?", answer: "   " }],
      }),
    ).toThrow(/empty/i);
  });

  it("serializes to valid JSON via safeJsonLdStringify", () => {
    const doc = buildFaqPageJsonLd({
      questions: [{ question: "Q?", answer: "A." }],
    });
    const s = safeJsonLdStringify(doc);
    expect(() => JSON.parse(s)).not.toThrow();
  });

  it("escapes </script> sequences to prevent script-tag breakout", () => {
    const doc = buildFaqPageJsonLd({
      questions: [
        {
          question: "Q?",
          answer: "contains </script> tag literal",
        },
      ],
    });
    const s = safeJsonLdStringify(doc);
    expect(s).not.toMatch(/<\/script/i);
    expect(s).toContain("<\\/script");
  });
});

describe("buildSoftwareApplicationJsonLd", () => {
  it("omits fake ratings / reviews / offers by design", () => {
    const doc = buildSoftwareApplicationJsonLd({
      name: "Verdant Grow Diary",
      description: "Grow diary and sensor-truth app.",
      url: "https://verdantgrowdiary.com/",
    });
    expect(doc["@type"]).toBe("SoftwareApplication");
    expect(doc.name).toBe("Verdant Grow Diary");
    expect(doc).not.toHaveProperty("aggregateRating");
    expect(doc).not.toHaveProperty("review");
    expect(doc).not.toHaveProperty("offers");
  });

  it("throws when required fields are missing", () => {
    expect(() =>
      buildSoftwareApplicationJsonLd({ name: "", description: "x" }),
    ).toThrow();
    expect(() =>
      buildSoftwareApplicationJsonLd({ name: "x", description: "" }),
    ).toThrow();
  });
});

describe("Landing FAQPage schema matches visible FAQ", () => {
  it("mirrors every visible landing FAQ question and answer 1:1", () => {
    const doc = buildFaqPageJsonLd({
      pageUrl: "https://verdantgrowdiary.com/welcome",
      questions: VERDANT_LANDING_FAQ,
    });
    expect(doc.mainEntity).toHaveLength(VERDANT_LANDING_FAQ.length);
    for (let i = 0; i < VERDANT_LANDING_FAQ.length; i++) {
      expect(doc.mainEntity[i].name).toBe(VERDANT_LANDING_FAQ[i].question);
      expect(doc.mainEntity[i].acceptedAnswer.text).toBe(
        VERDANT_LANDING_FAQ[i].answer,
      );
    }
  });

  it("makes no fake claims (no rating, no fake pricing, no autopilot)", () => {
    const s = safeJsonLdStringify(
      buildFaqPageJsonLd({ questions: VERDANT_LANDING_FAQ }),
    ).toLowerCase();
    for (const phrase of [
      "autopilot",
      "aggregaterating",
      "review",
      "controls your equipment",
      "controls your lights",
    ]) {
      expect(s).not.toContain(phrase);
    }
  });
});

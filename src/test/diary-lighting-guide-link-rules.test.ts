import { describe, expect, it } from "vitest";
import {
  buildDiaryLightingGuideLink,
  detectDiaryLightingGuideTopic,
} from "@/lib/diaryLightingGuideLinkRules";

describe("detectDiaryLightingGuideTopic", () => {
  it("returns null for empty and unrelated entries", () => {
    expect(detectDiaryLightingGuideTopic({})).toBeNull();
    expect(
      detectDiaryLightingGuideTopic({
        eventType: "watering",
        tags: ["watering"],
        notePreview: "Light watering today.",
      }),
    ).toBeNull();
    expect(
      detectDiaryLightingGuideTopic({
        notePreview: "Nutrient burn starts at several leaf tips.",
      }),
    ).toBeNull();
  });

  it("matches structured light checks without reading free text", () => {
    expect(
      detectDiaryLightingGuideTopic({
        eventType: "observation",
        environmentCheckType: "light",
      }),
    ).toBe("distance_intensity");
  });

  it("matches PPFD/DLI and schedule notes to their focused FAQ", () => {
    expect(
      detectDiaryLightingGuideTopic({
        notePreview: "Mapped PPFD at the center and edge.",
      }),
    ).toBe("ppfd_dli");
    expect(
      detectDiaryLightingGuideTopic({
        notePreview: "Changed the autoflower light schedule from 18/6 to 20/4.",
      }),
    ).toBe("schedule");
  });

  it("prioritizes stress over a generic setup or schedule mention", () => {
    expect(
      detectDiaryLightingGuideTopic({
        notePreview: "Possible light burn after the fixture schedule changed.",
      }),
    ).toBe("stress");
  });

  it("offers stress help for closed-set top-growth symptom combinations", () => {
    expect(
      detectDiaryLightingGuideTopic({
        observedSign: "bleached_tissue",
        observationLocation: "upper_growth",
      }),
    ).toBe("stress");
    expect(
      detectDiaryLightingGuideTopic({
        observedSign: "crispy_edges",
        observationLocation: "upper_growth",
      }),
    ).toBe("stress");
    expect(
      detectDiaryLightingGuideTopic({
        observedSign: "crispy_edges",
        observationLocation: "lower_leaves",
      }),
    ).toBeNull();
  });
});

describe("buildDiaryLightingGuideLink", () => {
  it.each([
    ["distance_intensity", { environmentCheckType: "light" }, 0],
    ["ppfd_dli", { notePreview: "DLI was higher today." }, 1],
    ["schedule", { notePreview: "Photoperiod is now 12/12." }, 2],
    ["stress", { notePreview: "Bleaching directly under grow light." }, 3],
  ] as const)("builds a contextual %s deep link", (topic, input, faqIndex) => {
    const link = buildDiaryLightingGuideLink(input);
    expect(link).toMatchObject({
      matchedTopic: topic,
      faqIndex,
      href: `/guides/cannabis-grow-light-distance-and-schedule#faq-${faqIndex}`,
      offersTroubleshooter: topic === "stress",
    });
    expect(link?.question).toBeTruthy();
  });

  it("is deterministic for repeated input", () => {
    const input = { notePreview: "Canopy PPFD map after dimmer change." };
    expect(buildDiaryLightingGuideLink(input)).toEqual(buildDiaryLightingGuideLink(input));
  });
});

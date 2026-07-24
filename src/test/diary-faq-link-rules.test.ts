/**
 * diaryFaqLinkRules tests — pure keyword/tag/eventType → FAQ topic mapping.
 * No queries, no writes, no AI. Deterministic input/output only.
 */
import { describe, expect, it } from "vitest";
import {
  buildDiaryFaqLink,
  detectDiaryFaqTopic,
} from "@/lib/diaryFaqLinkRules";
import { CANNABIS_PLANT_CARE_FAQ } from "@/constants/cannabisPlantCareFaq";

describe("detectDiaryFaqTopic", () => {
  it("returns null for empty input", () => {
    expect(detectDiaryFaqTopic({})).toBeNull();
    expect(
      detectDiaryFaqTopic({ eventType: null, tags: [], notePreview: "" }),
    ).toBeNull();
  });

  it("matches yellowing from note text", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "observation",
        tags: ["observation"],
        notePreview: "Lower fan leaves are turning yellow again.",
      }),
    ).toBe("yellowing");
  });

  it("matches environment from event type alone", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "environment",
        tags: [],
        notePreview: "",
      }),
    ).toBe("environment");
  });

  it("matches environment from humidity/temperature keywords", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "observation",
        tags: [],
        notePreview: "Tent humidity spiked and temp dropped overnight.",
      }),
    ).toBe("environment");
  });

  it("matches watering from tag when no keywords present", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "watering",
        tags: ["watering"],
        notePreview: "Gave the plants a drink.",
      }),
    ).toBe("watering");
  });

  it("matches nutrients from feeding tag or nutrient keywords", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "feeding",
        tags: ["feeding"],
        notePreview: "",
      }),
    ).toBe("nutrients");
    expect(
      detectDiaryFaqTopic({
        eventType: "observation",
        tags: [],
        notePreview: "Suspected nitrogen deficiency on middle nodes.",
      }),
    ).toBe("nutrients");
  });

  it("matches harvest topic", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "observation",
        tags: [],
        notePreview: "Most trichomes are milky, some amber.",
      }),
    ).toBe("harvest");
  });

  it("prefers symptom text (yellowing) over activity tag (watering)", () => {
    expect(
      detectDiaryFaqTopic({
        eventType: "watering",
        tags: ["watering"],
        notePreview: "Watered today, leaves still yellow and drooping.",
      }),
    ).toBe("yellowing");
  });

  it("is case-insensitive and word-bounded", () => {
    expect(
      detectDiaryFaqTopic({ notePreview: "YELLOW tips forming." }),
    ).toBe("yellowing");
    // 'watermelon' should not trip the 'water' keyword thanks to word boundary.
    expect(
      detectDiaryFaqTopic({
        eventType: "observation",
        tags: [],
        notePreview: "Smells like watermelon terps.",
      }),
    ).toBeNull();
  });
});

describe("buildDiaryFaqLink", () => {
  it("returns null when no topic matches", () => {
    expect(
      buildDiaryFaqLink({
        eventType: "photo",
        tags: ["photo"],
        notePreview: "New pheno picture.",
      }),
    ).toBeNull();
  });

  it("returns route + question for a matched topic", () => {
    const link = buildDiaryFaqLink({
      notePreview: "Leaves yellowing on lower canopy.",
    });
    expect(link).not.toBeNull();
    expect(link!.matchedTopic).toBe("yellowing");
    expect(link!.href).toBe("/guides/cannabis-plant-care#faq-2");
    expect(link!.question).toBe(CANNABIS_PLANT_CARE_FAQ[2].question);
  });

  it("all topic hrefs point at existing FAQ indices", () => {
    const inputs = [
      { topic: "watering", notePreview: "Overwatered again." },
      { topic: "nutrients", notePreview: "Nutrient burn tips." },
      { topic: "yellowing", notePreview: "Yellow leaves everywhere." },
      { topic: "environment", notePreview: "VPD too high." },
      { topic: "harvest", notePreview: "Trichomes look milky." },
    ] as const;
    for (const { topic, notePreview } of inputs) {
      const link = buildDiaryFaqLink({ notePreview });
      expect(link, `expected link for ${topic}`).not.toBeNull();
      expect(CANNABIS_PLANT_CARE_FAQ[link!.faqIndex]).toBeDefined();
    }
  });
});

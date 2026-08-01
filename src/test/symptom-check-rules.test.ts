import { describe, expect, it } from "vitest";
import {
  buildSymptomTimelineHref,
  resolveGuidedSymptomStage,
  validateGuidedSymptomCheck,
} from "@/lib/symptomCheckRules";
import { STAGES } from "@/lib/grow";

describe("guided Symptom Check rules", () => {
  it("prefills only the canonical Quick Log stage vocabulary", () => {
    for (const stage of STAGES) {
      expect(resolveGuidedSymptomStage(stage.value)).toBe(stage.value);
    }
    expect(resolveGuidedSymptomStage("Flowering")).toBe("flower");
    expect(resolveGuidedSymptomStage("Vegetative")).toBe("veg");
    expect(resolveGuidedSymptomStage("cure")).toBe("drying");
    expect(resolveGuidedSymptomStage("unknown")).toBeNull();
    expect(resolveGuidedSymptomStage(null)).toBeNull();
  });

  it("requires a visible sign, valid stage, and explicit confirmation", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: null,
        stage: "flower",
        stageConfirmed: true,
      }),
    ).toEqual({
      ok: false,
      reason: "Choose the visible sign you observed.",
    });
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: "yellowing",
        stage: "bad",
        stageConfirmed: true,
      }).ok,
    ).toBe(false);
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: "yellowing",
        stage: "flower",
        stageConfirmed: false,
      }).ok,
    ).toBe(false);
  });

  it("requires one selected plant before a guided Symptom Check can validate", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: null,
        symptomId: "yellowing",
        stage: "flower",
        stageConfirmed: true,
      }),
    ).toEqual({
      ok: false,
      reason: "Select a plant before saving this Symptom Check.",
    });
  });

  it("preserves the canonical stored sign code and one confirmed stage detail", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: "tip_damage",
        stage: "flower",
        stageConfirmed: true,
        observationLocation: "upper_growth",
      }),
    ).toEqual({
      ok: true,
      stage: "flower",
      details: {
        observedSign: "crispy_edges",
        observation_stage: "flower",
        observationLocation: "upper_growth",
      },
    });
  });

  it.each([
    ["flush", "flush"],
    ["cure", "drying"],
  ] as const)(
    "persists a valid %s plant stage as canonical %s evidence",
    (plantStage, expectedStage) => {
      expect(
        validateGuidedSymptomCheck({
          plantId: "plant-1",
          symptomId: "spots",
          stage: plantStage,
          stageConfirmed: true,
        }),
      ).toEqual({
        ok: true,
        stage: expectedStage,
        details: {
          observedSign: "spots",
          observation_stage: expectedStage,
        },
      });
    },
  );

  it("builds a grow-scoped timeline link and only anchors a safe returned id", () => {
    expect(buildSymptomTimelineHref("grow 1", "event-1")).toBe(
      "/timeline?growId=grow%201#timeline-entry-event-1",
    );
    expect(buildSymptomTimelineHref("grow 1", "unsafe/id")).toBe("/timeline?growId=grow%201");
    expect(buildSymptomTimelineHref(null, "event-1")).toBeNull();
  });
});

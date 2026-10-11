import { describe, expect, it } from "vitest";
import {
  buildSymptomTimelineHref,
  resolveGuidedSymptomStage,
  validateGuidedSymptomCheck,
} from "@/lib/symptomCheckRules";
import { STAGES } from "@/lib/grow";
import { findCannabisSymptomByObservedSign } from "@/constants/cannabisSymptomTypes";

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

  it("records a clean check without inventing a symptom sign", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: null,
        stage: "flower",
        stageConfirmed: true,
        noSymptomsObserved: true,
      }),
    ).toEqual({
      ok: true,
      stage: "flower",
      details: {
        observation_stage: "flower",
        symptom_check_result: "no_symptoms_observed",
      },
    });
  });

  it("keeps a clean check out of the symptom vocabulary", () => {
    const result = validateGuidedSymptomCheck({
      plantId: "plant-1",
      symptomId: null,
      stage: "veg",
      stageConfirmed: true,
      noSymptomsObserved: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.details).not.toHaveProperty("observedSign");
    expect(findCannabisSymptomByObservedSign(result.details.symptom_check_result)).toBeNull();
  });

  it("still requires a confirmed stage for a clean check", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: null,
        stage: "veg",
        stageConfirmed: false,
        noSymptomsObserved: true,
      }),
    ).toEqual({
      ok: false,
      reason: "Confirm the stage before saving this Symptom Check.",
    });
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: null,
        stage: null,
        stageConfirmed: true,
        noSymptomsObserved: true,
      }),
    ).toEqual({ ok: false, reason: "Choose the plant's current stage." });
  });

  it("fails closed when a symptom and no visible symptoms are both set", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: "spots",
        stage: "veg",
        stageConfirmed: true,
        noSymptomsObserved: true,
      }),
    ).toEqual({
      ok: false,
      reason: "Choose a visible sign or mark no visible symptoms, not both.",
    });
  });

  it("keeps requiring a sign when no visible symptoms is not set", () => {
    for (const draft of [{ noSymptomsObserved: false }, {}, { noSymptomsObserved: undefined }]) {
      expect(
        validateGuidedSymptomCheck({
          plantId: "plant-1",
          symptomId: null,
          stage: "veg",
          stageConfirmed: true,
          ...draft,
        }),
      ).toEqual({ ok: false, reason: "Choose the visible sign you observed." });
    }
  });

  it("carries an optional location on a clean check", () => {
    expect(
      validateGuidedSymptomCheck({
        plantId: "plant-1",
        symptomId: null,
        stage: "veg",
        stageConfirmed: true,
        noSymptomsObserved: true,
        observationLocation: "upper_growth",
      }),
    ).toEqual({
      ok: true,
      stage: "veg",
      details: {
        observation_stage: "veg",
        symptom_check_result: "no_symptoms_observed",
        observationLocation: "upper_growth",
      },
    });
  });

  it("builds a grow-scoped timeline link and only anchors a safe returned id", () => {
    expect(buildSymptomTimelineHref("grow 1", "event-1")).toBe(
      "/timeline?growId=grow%201#timeline-entry-event-1",
    );
    expect(buildSymptomTimelineHref("grow 1", "unsafe/id")).toBe("/timeline?growId=grow%201");
    expect(buildSymptomTimelineHref(null, "event-1")).toBeNull();
  });
});

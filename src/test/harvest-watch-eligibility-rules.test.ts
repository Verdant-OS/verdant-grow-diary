import { describe, expect, it } from "vitest";

import {
  evaluateHarvestWatchEligibility,
  isHarvestWatchEligible,
} from "@/lib/harvestWatchEligibilityRules";

describe("Harvest Watch eligibility", () => {
  it.each(["flower", "Flowering", " FLOWER "])(
    "allows the canonical flowering stage (%s)",
    (stage) => {
      expect(evaluateHarvestWatchEligibility({ stage })).toEqual({
        eligible: true,
        normalizedStage: "flower",
        reason: "eligible",
      });
    },
  );

  it.each(["seedling", "veg", "Vegetative", "flush", "harvest", "cure", "curing", "drying"])(
    "blocks the non-flowering stage %s",
    (stage) => {
      const result = evaluateHarvestWatchEligibility({ stage });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("stage_ineligible");
    },
  );

  it.each([null, undefined, "", "mystery", 42])(
    "fails closed when stage is unknown (%s)",
    (stage) => {
      expect(evaluateHarvestWatchEligibility({ stage })).toEqual({
        eligible: false,
        normalizedStage: null,
        reason: "stage_unknown",
      });
    },
  );

  it("blocks hard-archived, soft-archived, and merged plants", () => {
    expect(isHarvestWatchEligible({ stage: "flower", isArchived: true })).toBe(false);
    expect(
      isHarvestWatchEligible({
        stage: "flower",
        archivedAt: "2026-07-01T00:00:00Z",
      }),
    ).toBe(false);
    expect(
      isHarvestWatchEligible({
        stage: "flower",
        mergedIntoPlantId: "plant-target",
      }),
    ).toBe(false);
  });

  it("reports lifecycle exclusions before stage eligibility", () => {
    expect(evaluateHarvestWatchEligibility({ stage: "flower", isArchived: true }).reason).toBe(
      "plant_archived",
    );
    expect(
      evaluateHarvestWatchEligibility({
        stage: "flower",
        mergedIntoPlantId: "plant-target",
      }).reason,
    ).toBe("plant_merged");
  });
});

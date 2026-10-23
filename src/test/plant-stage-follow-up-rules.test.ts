import { describe, expect, it } from "vitest";
import { buildPlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

describe("buildPlantStageFollowUp edge cases", () => {
  it("offers holders with unknown or missing stage because targets cannot be inferred", () => {
    const f = buildPlantStageFollowUp({
      plantName: "AF-01",
      previousStage: "seedling",
      newStage: "veg",
      tent: { id: "t1", name: "Tent", stage: null },
      grow: { id: "g1", name: "Grow", stage: "garbage-stage" },
    });
    expect(f?.tent?.id).toBe("t1");
    expect(f?.grow?.id).toBe("g1");
    expect(f?.actionLabel).toBe("Update tent and grow");
  });

  it("returns null when every holder is already at or ahead of the new stage", () => {
    expect(
      buildPlantStageFollowUp({
        plantName: "AF-01",
        previousStage: "seedling",
        newStage: "veg",
        tent: { id: "t1", name: "Tent", stage: "flower" },
        grow: { id: "g1", name: "Grow", stage: "veg" },
      }),
    ).toBeNull();
  });

  it("does not offer holders without an id", () => {
    expect(
      buildPlantStageFollowUp({
        plantName: "AF-01",
        previousStage: "seedling",
        newStage: "veg",
        tent: { id: "", name: "Tent", stage: "seedling" },
        grow: null,
      }),
    ).toBeNull();
  });

  it("uses fallback copy when names are blank", () => {
    const f = buildPlantStageFollowUp({
      plantName: "  ",
      previousStage: "seedling",
      newStage: "veg",
      tent: { id: "t1", name: "", stage: "seedling" },
      grow: null,
    });
    expect(f?.message).toBe(
      "This plant is now Vegetative. Its tent is still on an earlier stage. Move it to Vegetative too?",
    );
    expect(f?.actionLabel).toBe("Update tent");
  });

  it("does not prompt for cure or harvest because they normalize to harvest close-out", () => {
    const base = {
      plantName: "AF-01",
      tent: { id: "t1", name: "Tent", stage: "seedling" },
      grow: { id: "g1", name: "Grow", stage: "seedling" },
    };
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "flower", newStage: "cure" }),
    ).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "flower", newStage: "harvest" }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildPlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

describe("buildPlantStageFollowUp edge cases", () => {
  const tent = { id: "t", name: "Tent A", stage: "seedling" };
  const grow = { id: "g", name: "Grow A", stage: "flower" };

  it("offers only holders behind the new stage", () => {
    const f = buildPlantStageFollowUp({
      plantName: "AF-01",
      previousStage: "seedling",
      newStage: "veg",
      tent,
      grow,
    });
    expect(f?.tent?.id).toBe("t");
    expect(f?.grow).toBeNull();
    expect(f?.actionLabel).toBe("Update tent");
  });

  it("offers grow-only when the tent already matches the new stage", () => {
    const f = buildPlantStageFollowUp({
      plantName: "AF-01",
      previousStage: "seedling",
      newStage: "veg",
      tent: { id: "t", name: "Tent A", stage: "veg" },
      grow: { id: "g", name: "Grow A", stage: "seedling" },
    });
    expect(f?.tent).toBeNull();
    expect(f?.grow?.id).toBe("g");
    expect(f?.actionLabel).toBe("Update grow");
    expect(f?.message).toContain("Grow A is still on an earlier stage");
    expect(f?.message).toContain("Move it to Vegetative too?");
  });

  it("never offers backwards moves, harvest close-out, drying, unchanged, or unknown plant stages", () => {
    const base = { plantName: "AF-01", tent, grow: { ...grow, stage: "seedling" } };
    expect(
      buildPlantStageFollowUp({
        ...base,
        previousStage: "veg",
        newStage: "seedling",
        tent: { ...tent, stage: "veg" },
        grow: { ...grow, stage: "veg" },
      }),
    ).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "flower", newStage: "harvest" }),
    ).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "flower", newStage: "drying" }),
    ).toBeNull();
    expect(buildPlantStageFollowUp({ ...base, previousStage: "veg", newStage: "veg" })).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "seedling", newStage: null }),
    ).toBeNull();
    expect(
      buildPlantStageFollowUp({ ...base, previousStage: "seedling", newStage: "not-a-stage" }),
    ).toBeNull();
  });

  it("treats unknown holder stages as lagging and uses fallback copy", () => {
    const f = buildPlantStageFollowUp({
      plantName: "   ",
      previousStage: "seedling",
      newStage: "flower",
      tent: { id: "t", name: null, stage: "mystery" },
      grow: null,
    });
    expect(f?.tent?.id).toBe("t");
    expect(f?.message).toMatch(/^This plant is now Flowering\. Its tent is still/);
    expect(f?.actionLabel).toBe("Update tent");
  });

  it("ignores holders without an id", () => {
    const f = buildPlantStageFollowUp({
      plantName: "AF-01",
      previousStage: "seedling",
      newStage: "veg",
      tent: { id: "", name: "Tent", stage: "seedling" },
      grow: { id: "g", name: "Grow", stage: "seedling" },
    });
    expect(f?.tent).toBeNull();
    expect(f?.grow?.id).toBe("g");
  });
});

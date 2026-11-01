import { describe, expect, it } from "vitest";
import {
  buildPlantStageFollowUp,
  plantStageFollowUpFailureMessage,
} from "@/lib/plantStageFollowUpRules";

describe("plantStageFollowUpFailureMessage", () => {
  it("names both holders when tent and grow writes fail", () => {
    expect(plantStageFollowUpFailureMessage({ tentUpdated: false, growUpdated: false })).toBe(
      "Couldn't update the stage. Edit the tent or grow to change it.",
    );
  });

  it("names only the tent when the grow write succeeds or was not offered", () => {
    expect(plantStageFollowUpFailureMessage({ tentUpdated: false, growUpdated: true })).toBe(
      "Couldn't update the tent's stage. Edit the tent to change it.",
    );
    expect(plantStageFollowUpFailureMessage({ tentUpdated: false, growUpdated: null })).toBe(
      "Couldn't update the tent's stage. Edit the tent to change it.",
    );
  });

  it("names only the grow when the tent write succeeds or was not offered", () => {
    expect(plantStageFollowUpFailureMessage({ tentUpdated: true, growUpdated: false })).toBe(
      "Couldn't update the grow's stage. Edit the grow to change it.",
    );
    expect(plantStageFollowUpFailureMessage({ tentUpdated: null, growUpdated: false })).toBe(
      "Couldn't update the grow's stage. Edit the grow to change it.",
    );
  });

  it("returns null when every attempted write succeeded", () => {
    expect(plantStageFollowUpFailureMessage({ tentUpdated: true, growUpdated: true })).toBeNull();
    expect(plantStageFollowUpFailureMessage({ tentUpdated: true, growUpdated: null })).toBeNull();
    expect(plantStageFollowUpFailureMessage({ tentUpdated: null, growUpdated: true })).toBeNull();
  });
});

describe("buildPlantStageFollowUp edge cases", () => {
  const tent = { id: "t", name: "Tent A", stage: "seedling" };
  const grow = { id: "g", name: "Grow A", stage: "seedling" };

  it("offers grow-only when the tent already matches the plant's new stage", () => {
    const f = buildPlantStageFollowUp({
      plantName: "AF-01",
      previousStage: "seedling",
      newStage: "veg",
      tent: { ...tent, stage: "veg" },
      grow,
    });
    expect(f?.tent).toBeNull();
    expect(f?.grow?.id).toBe("g");
    expect(f?.actionLabel).toBe("Update grow");
    expect(f?.message).toBe(
      "AF-01 is now Vegetative. Grow A is still on an earlier stage. Move it to Vegetative too?",
    );
  });

  it("treats an unknown holder stage as lagging and uses fallback names", () => {
    const f = buildPlantStageFollowUp({
      plantName: "  ",
      previousStage: "seedling",
      newStage: "veg",
      tent: { id: "t", name: "  ", stage: "mystery" },
      grow: { id: "g", name: null, stage: null },
    });
    expect(f?.tent?.id).toBe("t");
    expect(f?.grow?.id).toBe("g");
    expect(f?.message).toBe(
      "This plant is now Vegetative. Its tent and its grow are still on an earlier stage. Move them to Vegetative too?",
    );
  });

  it("returns null when tent and grow are already at or ahead of the new stage", () => {
    expect(
      buildPlantStageFollowUp({
        plantName: "AF-01",
        previousStage: "seedling",
        newStage: "veg",
        tent: { ...tent, stage: "veg" },
        grow: { ...grow, stage: "flower" },
      }),
    ).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  formatGrowStageBadge,
  formatGrowStageLabel,
  GROW_STAGES,
  normalizeGrowStage,
} from "@/constants/growStages";

describe("growStages taxonomy", () => {
  it("normalizes common aliases to canonical stages", () => {
    expect(normalizeGrowStage("Veg")).toBe("vegetative");
    expect(normalizeGrowStage("VEG")).toBe("vegetative");
    expect(normalizeGrowStage("vegetative")).toBe("vegetative");
    expect(normalizeGrowStage("Vegetation")).toBe("vegetative");
    expect(normalizeGrowStage("flowering")).toBe("flower");
    expect(normalizeGrowStage("Seed")).toBe("seedling");
    expect(normalizeGrowStage(null)).toBeNull();
    expect(normalizeGrowStage("nope")).toBeNull();
  });

  it("maps each canonical stage to one full label and one short badge", () => {
    expect(GROW_STAGES.vegetative.label).toBe("Vegetative");
    expect(GROW_STAGES.vegetative.badge).toBe("Veg");
    expect(GROW_STAGES.seedling.label).toBe("Seedling");
    expect(GROW_STAGES.flower.label).toBe("Flower");
    expect(GROW_STAGES.harvest.label).toBe("Harvest");
  });

  it("formatters return canonical labels for all known aliases", () => {
    for (const alias of ["Veg", "VEG", "vegetative", "Vegetation"]) {
      expect(formatGrowStageLabel(alias)).toBe("Vegetative");
      expect(formatGrowStageBadge(alias)).toBe("Veg");
    }
  });
});

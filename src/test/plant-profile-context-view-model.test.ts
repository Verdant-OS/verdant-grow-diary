import { describe, expect, it } from "vitest";
import {
  buildPlantProfileContextViewModel,
  PLANT_PROFILE_CONTEXT_COPY,
} from "@/lib/plantProfileContextViewModel";

describe("buildPlantProfileContextViewModel", () => {
  it("returns known stage and strain when available", () => {
    const vm = buildPlantProfileContextViewModel({
      stage: "Veg",
      strain: "Blue Dream",
    });
    expect(vm.stage.known).toBe(true);
    expect(vm.stage.label).toBe("Stage: Veg");
    expect(vm.strain.known).toBe(true);
    expect(vm.strain.label).toBe("Strain: Blue Dream");
  });

  it("marks medium unknown when no source exists", () => {
    const vm = buildPlantProfileContextViewModel({ stage: "Veg" });
    expect(vm.medium.known).toBe(false);
    expect(vm.medium.value).toBeNull();
    expect(vm.medium.label).toBe(PLANT_PROFILE_CONTEXT_COPY.unknownMedium);
  });

  it("marks pot size unknown when no source exists", () => {
    const vm = buildPlantProfileContextViewModel({});
    expect(vm.potSize.known).toBe(false);
    expect(vm.potSize.value).toBeNull();
    expect(vm.potSize.label).toBe(PLANT_PROFILE_CONTEXT_COPY.unknownPotSize);
  });

  it("treats blank/whitespace medium and pot size as unknown", () => {
    const vm = buildPlantProfileContextViewModel({
      medium: "   ",
      potSize: "",
    });
    expect(vm.medium.known).toBe(false);
    expect(vm.potSize.known).toBe(false);
  });

  it("does not infer medium or pot size from strain or other fields", () => {
    const vm = buildPlantProfileContextViewModel({
      stage: "Flower",
      strain: "Coco Loco 5gal",
    });
    expect(vm.medium.known).toBe(false);
    expect(vm.potSize.known).toBe(false);
  });

  it("exposes disabled coming-soon actions", () => {
    const vm = buildPlantProfileContextViewModel({});
    expect(vm.mediumAction.disabled).toBe(true);
    expect(vm.mediumAction.label).toMatch(/coming soon/i);
    expect(vm.potSizeAction.disabled).toBe(true);
    expect(vm.potSizeAction.label).toMatch(/coming soon/i);
  });

  it("normalizes unknown stage and strain copy", () => {
    const vm = buildPlantProfileContextViewModel({});
    expect(vm.stage.label).toBe(PLANT_PROFILE_CONTEXT_COPY.unknownStage);
    expect(vm.strain.label).toBe(PLANT_PROFILE_CONTEXT_COPY.unknownStrain);
  });
});

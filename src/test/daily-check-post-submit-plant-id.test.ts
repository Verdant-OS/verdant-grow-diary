/**
 * Post-submit plant id is a pure selection rule: an explicit picker choice
 * wins, including a cleared picker; an untouched valid route plant stays;
 * an untouched sole-plant default does not.
 */
import { describe, expect, it } from "vitest";
import { resolveDailyCheckPostSubmitPlantId } from "@/lib/dailyCheckPlantSelectionRules";

describe("resolveDailyCheckPostSubmitPlantId", () => {
  it("uses the plant the grower switched to", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "explicit",
        renderedPlantId: "p2",
        resolutionStatus: "valid",
        routePlantId: "p1",
      }),
    ).toBe("p2");
  });

  it("drops the route plant when the grower clears the picker", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "explicit",
        renderedPlantId: "",
        resolutionStatus: "valid",
        routePlantId: "p1",
      }),
    ).toBeNull();
  });

  it("keeps an untouched valid route plant", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "route",
        renderedPlantId: "p1",
        resolutionStatus: "valid",
        routePlantId: "p1",
      }),
    ).toBe("p1");
  });

  it("does not return an untouched sole-plant default", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "route",
        renderedPlantId: "p1",
        resolutionStatus: "missing",
        routePlantId: "",
      }),
    ).toBeNull();
  });

  it("returns the sole plant after the grower explicitly selects it", () => {
    expect(
      resolveDailyCheckPostSubmitPlantId({
        plantChoice: "explicit",
        renderedPlantId: "p1",
        resolutionStatus: "missing",
        routePlantId: "",
      }),
    ).toBe("p1");
  });
});

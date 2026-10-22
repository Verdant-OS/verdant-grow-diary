import { describe, expect, it } from "vitest";
import {
  dailyCheckArchiveCheckIsStale,
  dailyCheckSavePlantId,
} from "@/lib/dailyCheckPlantSelectionRules";

describe("dailyCheckSavePlantId", () => {
  it("uses the save-control hint when present", () => {
    expect(
      dailyCheckSavePlantId({ hintedPlantId: "dialog-plant", selectedPlantId: "page-plant" }),
    ).toBe("dialog-plant");
  });

  it("falls back to the page selection when the hint is blank", () => {
    expect(dailyCheckSavePlantId({ hintedPlantId: "  ", selectedPlantId: "page-plant" })).toBe(
      "page-plant",
    );
    expect(dailyCheckSavePlantId({ hintedPlantId: null, selectedPlantId: "page-plant" })).toBe(
      "page-plant",
    );
  });
});

describe("dailyCheckArchiveCheckIsStale", () => {
  it("is stale when the plant that would be saved changed during the read", () => {
    expect(dailyCheckArchiveCheckIsStale("P", "Q")).toBe(true);
  });

  it("is fresh when the checked plant still matches", () => {
    expect(dailyCheckArchiveCheckIsStale("P", "P")).toBe(false);
  });
});

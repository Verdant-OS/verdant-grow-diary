import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { feedingDefaultsPrefillSettled } from "@/lib/feedingDefaultsViewModel";
import {
  clearFeedingDefaultsSaveCutoffs,
  recordFeedingDefaultsSaveCutoff,
} from "@/lib/feedingDefaultsSaveCutoff";

afterEach(() => {
  clearFeedingDefaultsSaveCutoffs();
});

function settled(plantId: string, dataUpdatedAt: number) {
  return feedingDefaultsPrefillSettled({
    isFetching: false,
    isPending: false,
    isError: false,
    dataUpdatedAt,
    refetchRequiredAfter: 0,
    plantId,
    refetchRequiredAfterByPlant: {},
  });
}

describe("offline feed defaults stay unprefilled when the cache predates that plant's save", () => {
  it("skips a fresh sheet's cached recipe when it is older than the plant's last save", () => {
    recordFeedingDefaultsSaveCutoff("plant-a", 5_000);
    expect(settled("plant-a", 100)).toBe(false);
  });

  it("still prefills a different plant whose cache was not invalidated by that save", () => {
    recordFeedingDefaultsSaveCutoff("plant-a", 5_000);
    expect(settled("plant-b", 100)).toBe(true);
  });

  it("prefills once that plant's defaults are at least as new as its last save", () => {
    recordFeedingDefaultsSaveCutoff("plant-a", 5_000);
    expect(settled("plant-a", 5_000)).toBe(true);
  });

  it("records the plant cutoff from the feeding save path", () => {
    const sheetSource = readFileSync(
      resolve(__dirname, "../components/QuickLogV2Sheet.tsx"),
      "utf8",
    );
    const savedAt = sheetSource.indexOf("const savedPlantId = resolved.plantId ?? null;");
    const confirmedAt = sheetSource.indexOf("setSaveStatus(FEEDING_SAVE_SUCCESS_MESSAGE);");
    expect(sheetSource.slice(savedAt, confirmedAt)).toContain("recordFeedingDefaultsSaveCutoff");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { feedingDefaultsPrefillSettled } from "@/lib/feedingDefaultsViewModel";
import {
  readFeedingDefaultsSaveCutoff,
  recordFeedingDefaultsSaveCutoff,
} from "@/lib/feedingDefaultsSaveCutoff";

const sheetSource = readFileSync(resolve(__dirname, "../components/QuickLogV2Sheet.tsx"), "utf8");

function settled(plantId: string, dataUpdatedAt: number, recordedSaveCutoff = 0) {
  return feedingDefaultsPrefillSettled({
    isFetching: false,
    isPending: false,
    isError: false,
    dataUpdatedAt,
    refetchRequiredAfter: 0,
    plantId,
    refetchRequiredAfterByPlant: {},
    recordedSaveCutoff,
  });
}

describe("offline feed defaults stay unprefilled when the cache predates that plant's save", () => {
  it("skips a fresh sheet's cached recipe when it is older than the plant's last save", () => {
    expect(settled("plant-a", 100, 5_000)).toBe(false);
  });

  it("still prefills a different plant whose cache was not invalidated by that save", () => {
    const client = new QueryClient();
    recordFeedingDefaultsSaveCutoff(client, "plant-a", 5_000);
    expect(readFeedingDefaultsSaveCutoff(client, "plant-b")).toBe(0);
    expect(settled("plant-b", 100, 0)).toBe(true);
  });

  it("prefills once that plant's defaults are at least as new as its last save", () => {
    expect(settled("plant-a", 5_000, 5_000)).toBe(true);
  });

  it("keeps the cutoff on the query client so another client cannot see it", () => {
    const savedOn = new QueryClient();
    const otherSheet = new QueryClient();
    recordFeedingDefaultsSaveCutoff(savedOn, "plant-1", 5_000);
    expect(readFeedingDefaultsSaveCutoff(savedOn, "plant-1")).toBe(5_000);
    expect(readFeedingDefaultsSaveCutoff(otherSheet, "plant-1")).toBe(0);
  });

  it("records the plant cutoff from the feeding save path", () => {
    const savedAt = sheetSource.indexOf("const savedPlantId = resolved.plantId ?? null;");
    const confirmedAt = sheetSource.indexOf("setSaveStatus(FEEDING_SAVE_SUCCESS_MESSAGE);");
    expect(sheetSource.slice(savedAt, confirmedAt)).toContain("recordFeedingDefaultsSaveCutoff");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { feedingDefaultsPrefillSettled } from "@/lib/feedingDefaultsViewModel";

const plantDetailSource = readFileSync(resolve(__dirname, "../pages/PlantDetail.tsx"), "utf8");

describe("feedingDefaultsPrefillSettled combined cutoffs", () => {
  it("holds while the defaults query is still pending", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: true,
        isError: false,
        dataUpdatedAt: 9_000,
        refetchRequiredAfter: 0,
      }),
    ).toBe(false);
  });

  it("uses the later of the in-session refetch marker and the recorded save cutoff", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 4_000,
        refetchRequiredAfter: 0,
        plantId: "plant-a",
        refetchRequiredAfterByPlant: { "plant-a": 3_000 },
        recordedSaveCutoff: 5_000,
      }),
    ).toBe(false);
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 5_000,
        refetchRequiredAfter: 0,
        plantId: "plant-a",
        refetchRequiredAfterByPlant: { "plant-a": 3_000 },
        recordedSaveCutoff: 5_000,
      }),
    ).toBe(true);
  });
});

describe("plant detail hero photo fallback wiring", () => {
  it("passes the newest strip thumbnail as PlantPhoto fallbackSrc", () => {
    expect(plantDetailSource).toMatch(
      /fallbackSrc=\{photoStrip\.items\[0\]\?\.thumbnailUrl \?\? null\}/,
    );
  });
});

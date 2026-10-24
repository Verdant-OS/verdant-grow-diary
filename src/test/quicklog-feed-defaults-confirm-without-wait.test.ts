import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { feedingDefaultsPrefillSettled } from "@/lib/feedingDefaultsViewModel";
import { refetchRecentFeedingsForDefaults } from "@/hooks/useRecentFeedingsForDefaults";

const sheetSource = readFileSync(resolve(__dirname, "../components/QuickLogV2Sheet.tsx"), "utf8");
const plantDetailSource = readFileSync(resolve(__dirname, "../pages/PlantDetail.tsx"), "utf8");

describe("feeding save confirmation does not wait on the defaults refetch", () => {
  it("returns before a hung invalidate finishes and does not refetch again", () => {
    const invalidateQueries = vi.fn(
      () =>
        new Promise<void>(() => {
          /* stays pending */
        }),
    );
    const refetchQueries = vi.fn(async () => undefined);
    const client = { invalidateQueries, refetchQueries };
    const done = refetchRecentFeedingsForDefaults(client, "plant-1");
    expect(done).toBe(true);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it("shows the feeding confirmation without awaiting the defaults refresh", () => {
    const savedAt = sheetSource.indexOf("const savedPlantId = resolved.plantId ?? null;");
    const confirmedAt = sheetSource.indexOf("setSaveStatus(FEEDING_SAVE_SUCCESS_MESSAGE);");
    expect(savedAt).toBeGreaterThan(-1);
    expect(confirmedAt).toBeGreaterThan(savedAt);
    expect(sheetSource.slice(savedAt, confirmedAt)).not.toMatch(/await /);
    expect(sheetSource).not.toContain("refetchRecentFeedingsForDefaults");
  });
});

describe("feeding defaults freshness cutoff is per plant", () => {
  it("does not hold plant B for a cutoff recorded against plant A", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 100,
        refetchRequiredAfter: 9_000,
        plantId: "plant-b",
        refetchRequiredAfterByPlant: { "plant-a": 5_000 },
      }),
    ).toBe(true);
  });

  it("still holds plant A until that plant's refetch is newer than its cutoff", () => {
    expect(
      feedingDefaultsPrefillSettled({
        isFetching: false,
        isPending: false,
        isError: false,
        dataUpdatedAt: 100,
        refetchRequiredAfter: 0,
        plantId: "plant-a",
        refetchRequiredAfterByPlant: { "plant-a": 5_000 },
      }),
    ).toBe(false);
  });
});

describe("plant hero keeps the profile photo expression", () => {
  it("passes plant.photo as the PlantPhoto src", () => {
    expect(plantDetailSource).toMatch(/<PlantPhoto[\s\S]*?src=\{plant\.photo\}/);
  });
});

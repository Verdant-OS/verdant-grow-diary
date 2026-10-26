/**
 * Daily Grow Check: an unfinished local day is pending, not missed, and a
 * lone in-scope plant is the default selection when the URL names none.
 */
import { describe, expect, it } from "vitest";

import { defaultDailyCheckPlantId } from "@/lib/dailyCheckPlantSelectionRules";
import {
  buildDailyGrowCheckConsistency,
  buildDailyMethodBreakdown,
  formatDailyMethodBreakdownLabel,
} from "@/lib/dailyGrowCheckConsistencyRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);

describe("open local day is pending", () => {
  it("does not count today as missed before the day ends", () => {
    const summary = buildDailyGrowCheckConsistency({
      now: NOW,
      windowDays: 7,
      plantId: "plant-1",
      currentTentId: "tent-1",
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [],
    });
    const today = buildDailyMethodBreakdown(summary, "newest-first")[0];

    expect(summary.missedDays).toBe(6);
    expect(today.label).toBe("Today");
    expect(today.method).toBe("pending");
    expect(formatDailyMethodBreakdownLabel(today.method)).toBe("Not yet");
  });

  it("still counts a finished empty day as missed", () => {
    const summary = buildDailyGrowCheckConsistency({
      now: NOW,
      windowDays: 7,
      plantId: "plant-1",
      currentTentId: "tent-1",
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [],
    });
    const yesterday = buildDailyMethodBreakdown(summary, "newest-first")[1];

    expect(yesterday.label).toBe("Yesterday");
    expect(yesterday.method).toBe("missed");
  });
});

describe("sole in-scope plant default", () => {
  it("selects the only plant when the URL does not name one", () => {
    expect(
      defaultDailyCheckPlantId({
        routePlantId: "",
        resolutionStatus: "missing",
        selectablePlantIds: ["plant-only"],
      }),
    ).toBe("plant-only");
  });

  it("does not pick when several plants are selectable", () => {
    expect(
      defaultDailyCheckPlantId({
        routePlantId: "",
        resolutionStatus: "missing",
        selectablePlantIds: ["a", "b"],
      }),
    ).toBe("");
  });

  it("keeps an explicit route plant and does not replace a rejected id", () => {
    expect(
      defaultDailyCheckPlantId({
        routePlantId: "named",
        resolutionStatus: "valid",
        selectablePlantIds: ["named"],
      }),
    ).toBe("named");
    expect(
      defaultDailyCheckPlantId({
        routePlantId: "",
        resolutionStatus: "unknown",
        selectablePlantIds: ["only"],
      }),
    ).toBe("");
  });
});

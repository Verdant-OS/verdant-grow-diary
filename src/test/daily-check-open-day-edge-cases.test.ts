/**
 * Regression guards for #2085 open-day logic: activity on today and days
 * before tracking starts must not be misclassified as pending or open.
 */
import { describe, expect, it } from "vitest";

import {
  buildDailyGrowCheckConsistency,
  buildDailyMethodBreakdown,
} from "@/lib/dailyGrowCheckConsistencyRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);

function localIso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

describe("open local day edge cases", () => {
  it("does not mark today pending when today already has a plant Quick Log", () => {
    const summary = buildDailyGrowCheckConsistency({
      now: NOW,
      windowDays: 7,
      plantId: "plant-1",
      currentTentId: "tent-1",
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [{ entry_at: localIso(2026, 4, 24), id: "d1", plant_id: "plant-1" }],
    });
    const today = buildDailyMethodBreakdown(summary, "newest-first")[0];
    expect(summary.todayHasActivity).toBe(true);
    expect(today.method).toBe("note");
    expect(summary.missedDays).toBe(6);
  });

  it("classifies calendar today as not-tracked (not pending) before tracking starts", () => {
    const summary = buildDailyGrowCheckConsistency({
      now: NOW,
      windowDays: 7,
      plantId: "plant-1",
      currentTentId: "tent-1",
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [],
      trackingStartedAt: new Date(2026, 4, 25, 9, 0, 0).toISOString(),
    });
    const today = buildDailyMethodBreakdown(summary, "newest-first")[0];
    expect(today.method).toBe("not-tracked");
    expect(today.method).not.toBe("pending");
    expect(summary.untrackedDays).toBe(7);
    expect(summary.missedDays).toBe(0);
  });
});

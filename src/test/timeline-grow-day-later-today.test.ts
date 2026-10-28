/**
 * A grow start later the same local day has not started. The header omits
 * the day instead of showing day 0.
 */
import { describe, expect, it } from "vitest";
import { resolveTimelineGrowDay } from "@/lib/plantStartDateRules";

describe("resolveTimelineGrowDay later today", () => {
  it("returns null when the start instant is later the same local day", () => {
    const now = new Date(2026, 9, 11, 10, 0, 0);
    const startedAt = new Date(2026, 9, 11, 18, 0, 0).toISOString();
    expect(resolveTimelineGrowDay(startedAt, now)).toBeNull();
  });
});

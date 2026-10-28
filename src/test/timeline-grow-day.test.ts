/**
 * Timeline grow-day count uses local calendar days, the same count as
 * resolvePlantAge, including a clock that has crossed local midnight
 * without completing another 24-hour period.
 */
import { describe, expect, it } from "vitest";
import { resolveTimelineGrowDay } from "@/lib/plantStartDateRules";

describe("resolveTimelineGrowDay", () => {
  it("is day 0 on the start's local calendar day, even hours after an evening start", () => {
    const startedAt = new Date(2026, 9, 11, 21, 0, 0).toISOString();
    const now = new Date(2026, 9, 11, 23, 30, 0);
    expect(resolveTimelineGrowDay(startedAt, now)).toBe(0);
  });

  it("counts each local midnight, including when two midnights pass inside two 24-hour periods", () => {
    const startedAt = new Date(2026, 9, 11, 23, 0, 0).toISOString();
    const now = new Date(2026, 9, 13, 1, 0, 0);
    expect(resolveTimelineGrowDay(startedAt, now)).toBe(2);
  });

  it("returns null for a missing, invalid, or future start", () => {
    const now = new Date(2026, 9, 14, 12, 0, 0);
    expect(resolveTimelineGrowDay(null, now)).toBeNull();
    expect(resolveTimelineGrowDay("   ", now)).toBeNull();
    expect(resolveTimelineGrowDay("not-a-date", now)).toBeNull();
    expect(resolveTimelineGrowDay(new Date(2026, 9, 20, 9, 0, 0).toISOString(), now)).toBeNull();
  });
});

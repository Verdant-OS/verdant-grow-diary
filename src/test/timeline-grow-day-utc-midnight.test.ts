/**
 * Grow starts are timestamptz instants. A value that lands on UTC midnight
 * is still that instant, including when a zone west of UTC stores an evening
 * local start as the next UTC date at 00:00:00.000Z.
 */
import { describe, expect, it } from "vitest";
import { resolveTimelineGrowDay } from "@/lib/plantStartDateRules";

describe("resolveTimelineGrowDay UTC-midnight grow starts", () => {
  it("is day 0 the same local evening when the stored instant is UTC midnight", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    try {
      const startedAt = new Date(2026, 9, 11, 21, 0, 0).toISOString();
      const now = new Date(2026, 9, 11, 23, 30, 0);
      expect(startedAt).toBe("2026-10-12T00:00:00.000Z");
      expect(resolveTimelineGrowDay(startedAt, now)).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

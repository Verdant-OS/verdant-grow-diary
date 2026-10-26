import { describe, expect, it } from "vitest";

import {
  CRONK_FEED_LOG_CTA_HREF,
  CRONK_FEED_LOG_DATE_MODIFIED,
  CRONK_FEED_LOG_DATE_PUBLISHED,
  CRONK_FEED_LOG_DISCLAIMER,
  CRONK_FEED_LOG_FAQ,
  CRONK_FEED_LOG_PATH,
  CRONK_VPD_CALCULATOR_PATH,
  CRONK_VPD_TRACKER_PATH,
  createDefaultFeedLogState,
  cronkPlannedHelper,
  cronkScheduleUrl,
  escapeCsvField,
  evaluateProductCell,
  parseCsvSingleField,
} from "@/lib/cronkFeedLogRules";

describe("cronk feed log rules", () => {
  it("keeps the original URL, publish date, signup CTA, and blank plan", () => {
    const state = createDefaultFeedLogState();
    expect(CRONK_FEED_LOG_PATH).toBe("/guides/cronk-nutrients-grow-diary");
    expect(CRONK_FEED_LOG_CTA_HREF).toBe("/auth?mode=signup");
    expect(CRONK_FEED_LOG_DATE_PUBLISHED).toBe("2026-07-16");
    expect(CRONK_FEED_LOG_DATE_MODIFIED).toBe("2026-10-26");
    expect(state.line).toBe("classic");
    expect(state.medium).toBe("Soil");
    expect(state.weeks).toHaveLength(12);
    expect(state.products).toEqual(["Product 1", "Product 2", "Product 3"]);
    expect(
      state.weeks.every((week) =>
        week.products.every((cell) => cell.planned === "" && cell.actual === ""),
      ),
    ).toBe(true);
    expect(CRONK_FEED_LOG_DISCLAIMER).toBe(
      "Cronk Nutrients, Bonnie & Clyde and PuurOrganics are trademarks of their respective owners. Verdant Grow Diary is not affiliated with, sponsored by, or endorsed by Cronk Nutrients. Always follow the official feeding chart and product labels.",
    );
    expect(CRONK_VPD_TRACKER_PATH).toBe("/guides/grow-room-vpd-tracker");
    expect(CRONK_VPD_CALCULATOR_PATH).toBe("/tools/vpd-calculator");
  });

  it("ports the standalone self-tests for difference, percent, flags, and CSV escaping", () => {
    const first = evaluateProductCell(2, 2.5, 10);
    expect(first.diffFormatted).toBe("+0.50");
    expect(first.pctFormatted).toBe("125");

    const second = evaluateProductCell(4, 3, 10);
    expect(second.diffFormatted).toBe("\u22121.00");
    expect(second.pctFormatted).toBe("75");

    const zeroPlan = evaluateProductCell(0, 1, 10);
    expect(zeroPlan.pctFormatted).toBe("");
    expect(zeroPlan.flag).toBeNull();

    const emptyPlan = evaluateProductCell("", 1, 10);
    expect(emptyPlan.pctFormatted).toBe("");
    expect(emptyPlan.flag).toBeNull();

    expect(evaluateProductCell(10, 10.8, 10).flag).toBeNull();
    expect(evaluateProductCell(10, 11.2, 10).flag).toBe("Over plan");
    expect(evaluateProductCell(10, 8.9, 10).flag).toBe("Under plan");

    const sample = 'Leaf note, with "quoted text"\nand newline';
    const escaped = escapeCsvField(sample);
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped.endsWith('"')).toBe(true);
    expect(parseCsvSingleField(escaped)).toBe(sample);
  });

  it("changes only the chart link when the line changes", () => {
    expect(cronkPlannedHelper("classic")).toMatch(/Classic/);
    expect(cronkScheduleUrl("bonnie_clyde")).toMatch(/Autoflower/);
    expect(cronkScheduleUrl("puurorganics")).toMatch(/feeding-charts/);
    expect(JSON.stringify(CRONK_FEED_LOG_FAQ)).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:ml|ppm|ec)\b/i);
  });
});

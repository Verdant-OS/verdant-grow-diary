import { describe, expect, it } from "vitest";

import {
  addFeedLogProduct,
  addFeedLogWeek,
  ATHENA_FEED_LOG_DISCLAIMER,
  ATHENA_FEED_LOG_PATH,
  athenaPlannedHelper,
  buildFeedLogCsv,
  createDefaultFeedLogState,
  evaluateProductCell,
  escapeCsvField,
  FEED_LOG_DEFAULT_TOLERANCE,
  formatSignedDifference,
  removeFeedLogProduct,
  removeFeedLogWeek,
  summarizeFeedLog,
} from "@/lib/athenaFeedLogRules";

describe("athena feed log rules", () => {
  it("publishes the route, blank plan, and default tolerance", () => {
    const state = createDefaultFeedLogState();
    expect(ATHENA_FEED_LOG_PATH).toBe("/guides/athena-feed-chart-log");
    expect(FEED_LOG_DEFAULT_TOLERANCE).toBe("10");
    expect(state.line).toBe("pro_line");
    expect(state.weeks).toHaveLength(12);
    expect(state.products).toEqual(["Product 1", "Product 2", "Product 3"]);
    expect(
      state.weeks.every((week) =>
        week.products.every((cell) => cell.planned === "" && cell.actual === ""),
      ),
    ).toBe(true);
    expect(state.amountUnit).toBe("ml/gal");
    expect(ATHENA_FEED_LOG_DISCLAIMER).toContain(
      "not affiliated with, sponsored by, or endorsed by Athena",
    );
  });

  it("flags a cell only when the actual amount leaves the tolerance band", () => {
    expect(evaluateProductCell("2", "2.5", "10")).toMatchObject({
      diffNum: 0.5,
      diffFormatted: "+0.50",
      pctFormatted: "125",
      flag: "Over plan",
    });
    expect(evaluateProductCell("4", "3", "10")).toMatchObject({
      diffFormatted: "\u22121.00",
      pctFormatted: "75",
      flag: "Under plan",
    });
    expect(evaluateProductCell("0", "1", "10")).toMatchObject({ pctFormatted: "", flag: null });
    expect(evaluateProductCell("", "1", "10")).toMatchObject({
      plannedNum: null,
      pctFormatted: "",
      flag: null,
    });
    expect(evaluateProductCell("10", "10.8", "10").flag).toBeNull();
    expect(evaluateProductCell("10", "11.2", "10").flag).toBe("Over plan");
    expect(evaluateProductCell("10", "8.9", "10").flag).toBe("Under plan");
  });

  it("formats signed differences to two decimals", () => {
    expect(formatSignedDifference(0.5)).toBe("+0.50");
    expect(formatSignedDifference(-1)).toBe("\u22121.00");
    expect(formatSignedDifference(0)).toBe("0.00");
  });

  it("changes helper text with the line and measuring method without filling values", () => {
    const state = createDefaultFeedLogState();
    expect(athenaPlannedHelper(state)).toContain("Pro Line");
    expect(athenaPlannedHelper(state)).toContain("concentrate");
    expect(athenaPlannedHelper({ ...state, measuringMethod: "by_weight" })).toContain("weight");
    expect(athenaPlannedHelper({ ...state, line: "blended" })).toContain("Blended");
    expect(athenaPlannedHelper(state)).not.toMatch(/\d/);
  });

  it("summarizes filled weeks and flagged products", () => {
    const state = createDefaultFeedLogState();
    state.weeks[0].products[0] = { planned: "2", actual: "2.5" };
    state.weeks[1].products[0] = { planned: "2", actual: "2" };
    const summary = summarizeFeedLog(state);
    expect(summary.weeksFilled).toBe(2);
    expect(summary.weeksFlagged).toBe(1);
    expect(summary.products[0]).toMatchObject({
      name: "Product 1",
      totalPlanned: 4,
      totalActual: 4.5,
      weeksFlagged: 1,
    });
  });

  it("exports line and method columns and escapes a note with comma, quote, and newline", () => {
    const state = createDefaultFeedLogState();
    state.weeks[0].notes = 'saw "tip", then\nnew line';
    state.weeks[0].products[0] = { planned: "2", actual: "2.5" };
    const csv = buildFeedLogCsv(state);
    expect(csv.split("\r\n")[0]).toContain("Athena Line");
    expect(csv.split("\r\n")[0]).toContain("Measuring Method");
    expect(csv.split("\r\n")[0]).toContain("Avg Temp (°F)");
    expect(csv).toContain("pro_line");
    expect(csv).toContain("by_concentrate");
    expect(csv).toContain("+0.50");
    const escaped = escapeCsvField(state.weeks[0].notes);
    expect(escaped.startsWith('"')).toBe(true);
    expect(escaped).toContain('""tip""');
    expect(csv).toContain(escaped);
  });

  it("adds and removes weeks and products without mutating the previous state", () => {
    const start = createDefaultFeedLogState();
    const addedWeek = addFeedLogWeek(start);
    expect(addedWeek.weeks).toHaveLength(13);
    expect(start.weeks).toHaveLength(12);
    expect(removeFeedLogWeek(addedWeek).weeks).toHaveLength(12);
    const addedProduct = addFeedLogProduct(start);
    expect(addedProduct.products).toHaveLength(4);
    expect(start.products).toHaveLength(3);
    expect(removeFeedLogProduct(addedProduct).products).toHaveLength(3);
  });
});

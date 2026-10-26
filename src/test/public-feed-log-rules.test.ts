import { describe, expect, it } from "vitest";

import {
  addFeedLogProduct,
  addFeedLogWeek,
  buildFeedLogCsv,
  createDefaultFeedLogState,
  evaluateProductCell,
  FEED_LOG_DEFAULT_TOLERANCE,
  FEED_LOG_FAQ,
  formatSignedDifference,
  PUBLIC_FEED_LOG_PATH,
  removeFeedLogProduct,
  removeFeedLogWeek,
  summarizeFeedLog,
} from "@/lib/publicFeedLogRules";

describe("public feed log rules", () => {
  it("publishes the route, blank plan, and default tolerance", () => {
    const state = createDefaultFeedLogState();
    expect(PUBLIC_FEED_LOG_PATH).toBe("/guides/advanced-nutrients-feeding-chart-log");
    expect(FEED_LOG_DEFAULT_TOLERANCE).toBe("10");
    expect(state.weeks).toHaveLength(12);
    expect(state.products).toEqual(["Product 1", "Product 2", "Product 3"]);
    expect(
      state.weeks.every((week) =>
        week.products.every((cell) => cell.planned === "" && cell.actual === ""),
      ),
    ).toBe(true);
    expect(state.amountUnit).toBe("ml/gal");
    expect(FEED_LOG_FAQ.map((entry) => entry.question)).toContain(
      "Where is the official Advanced Nutrients feeding chart?",
    );
  });

  it("flags a cell only when the actual amount leaves the tolerance band", () => {
    expect(evaluateProductCell("2", "2.5", "10")).toMatchObject({
      diffNum: 0.5,
      diffFormatted: "+0.50",
      pctFormatted: "125",
      flag: "Over plan",
    });
    expect(evaluateProductCell("2", "2.16", "10").flag).toBeNull();
    expect(evaluateProductCell("2", "2.24", "10").flag).toBe("Over plan");
    expect(evaluateProductCell("0", "1", "10")).toMatchObject({ pctFormatted: "", flag: null });
    expect(evaluateProductCell("", "1", "10")).toMatchObject({
      plannedNum: null,
      pctFormatted: "",
      flag: null,
    });
    expect(evaluateProductCell("4", "3.5", "10").flag).toBe("Under plan");
  });

  it("formats signed differences to two decimals", () => {
    expect(formatSignedDifference(0.5)).toBe("+0.50");
    expect(formatSignedDifference(-1)).toBe("\u22121.00");
    expect(formatSignedDifference(0)).toBe("0.00");
  });

  it("summarizes filled weeks and flagged products", () => {
    const state = createDefaultFeedLogState();
    state.products[0] = "Base A";
    state.weeks[0].products[0] = { planned: "2", actual: "2.5" };
    state.weeks[1].products[0] = { planned: "2", actual: "2" };
    const summary = summarizeFeedLog(state);
    expect(summary.weeksFilled).toBe(2);
    expect(summary.weeksFlagged).toBe(1);
    expect(summary.products[0]).toMatchObject({
      name: "Base A",
      totalPlanned: 4,
      totalActual: 4.5,
      weeksFlagged: 1,
    });
  });

  it("exports one header and one row per week without inventing dosages", () => {
    const state = createDefaultFeedLogState();
    state.growName = "Veg tent";
    state.weeks[0].products[0] = { planned: "2", actual: "2.5" };
    state.weeks[0].avgTempF = "78";
    const csv = buildFeedLogCsv(state);
    expect(csv.split("\r\n")[0]).toContain("Avg Temp (°F)");
    expect(csv).toContain("Veg tent");
    expect(csv).toContain("+0.50");
    expect(csv).toContain("125%");
    expect(csv).toContain("Over plan");
    expect(csv).not.toContain("Sensi Grow A");
  });

  it("adds and removes weeks and products without mutating the previous state", () => {
    const start = createDefaultFeedLogState();
    const addedWeek = addFeedLogWeek(start);
    expect(addedWeek.weeks).toHaveLength(13);
    expect(start.weeks).toHaveLength(12);
    expect(removeFeedLogWeek(addedWeek).weeks).toHaveLength(12);
    const addedProduct = addFeedLogProduct(start);
    expect(addedProduct.products).toHaveLength(4);
    expect(addedProduct.weeks[0]?.products).toHaveLength(4);
    expect(start.products).toHaveLength(3);
    expect(removeFeedLogProduct(addedProduct).products).toHaveLength(3);
    expect(
      removeFeedLogProduct({ ...start, products: ["Only"], weeks: start.weeks }).products,
    ).toEqual(["Only"]);
  });
});

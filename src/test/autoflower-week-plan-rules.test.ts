import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  addWeeksIso,
  computeMilestoneDifference,
  computePlanSchedule,
  escapeCsvField,
  getDefaultStageOutline,
  lookupCurrentWeekStatus,
  parseIsoDateUtc,
  shouldEmitThrottled,
  validateStageWeeks,
  weekIndexForDate,
} from "@/lib/autoflowerWeekPlanRules";

describe("autoflower week plan date math (calendar, UTC-based)", () => {
  it("month end: 2026-01-31 + 7d = 2026-02-07", () => {
    expect(addDaysIso("2026-01-31", 7)).toBe("2026-02-07");
    expect(addWeeksIso("2026-01-31", 1)).toBe("2026-02-07");
  });
  it("month end: 2026-04-30 + 1d = 2026-05-01", () => {
    expect(addDaysIso("2026-04-30", 1)).toBe("2026-05-01");
  });
  it("year end: 2026-12-28 + 7d = 2027-01-04", () => {
    expect(addDaysIso("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("leap year: 2028-02-28 + 1d = 2028-02-29", () => {
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("leap year: 2028-02-29 + 1d = 2028-03-01", () => {
    expect(addDaysIso("2028-02-29", 1)).toBe("2028-03-01");
  });
  it("non-leap year: 2027-02-28 + 1d = 2027-03-01", () => {
    expect(addDaysIso("2027-02-28", 1)).toBe("2027-03-01");
  });
  it("century rule: 2100 is not a leap year", () => {
    expect(addDaysIso("2100-02-28", 1)).toBe("2100-03-01");
    expect(parseIsoDateUtc("2100-02-29")).toBeNull();
    expect(parseIsoDateUtc("2000-02-29")).not.toBeNull();
  });
  it("DST spring-forward and fall-back dates add exactly one calendar day", () => {
    expect(addDaysIso("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysIso("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDaysIso("2026-04-05", 1)).toBe("2026-04-06");
  });
  it("week index relative to sprout: day 0 and day 6 are week 1, day 7 is week 2", () => {
    expect(weekIndexForDate("2026-11-01", "2026-11-01")).toBe(1);
    expect(weekIndexForDate("2026-11-01", "2026-11-07")).toBe(1);
    expect(weekIndexForDate("2026-11-01", "2026-11-08")).toBe(2);
    expect(weekIndexForDate("2026-11-01", "2026-10-31")).toBeNull();
  });
  it("invalid and blank inputs return empty/null, never throw", () => {
    for (const bad of [
      "",
      "   ",
      "2026-13-01",
      "2026-04-31",
      "2026/01/01",
      "abc",
      null,
      undefined,
    ]) {
      expect(addDaysIso(bad as string, 1)).toBe("");
      expect(parseIsoDateUtc(bad as string)).toBeNull();
    }
    expect(addDaysIso("2026-01-01", 1.5)).toBe("");
    expect(weekIndexForDate("", "2026-01-01")).toBeNull();
    expect(computePlanSchedule("", 10)).toEqual({ weeks: [], estimatedFinish: "" });
  });
  it("is deterministic across repeated calls", () => {
    const a = computePlanSchedule("2026-11-01", 10);
    const b = computePlanSchedule("2026-11-01", 10);
    expect(a).toEqual(b);
  });
});

describe("autoflower week plan schedule and stages (source self-tests)", () => {
  it("sprout 2026-11-01, E=10: week 1 and finish dates", () => {
    const plan = computePlanSchedule("2026-11-01", 10);
    expect(plan.weeks).toHaveLength(10);
    expect(plan.weeks[0]).toMatchObject({ startIso: "2026-11-01", endIso: "2026-11-07" });
    expect(plan.weeks[0].labelRange).toBe("Nov 1–Nov 7");
    expect(plan.weeks[9].endIso).toBe("2027-01-09");
    expect(plan.estimatedFinish).toBe("2027-01-09");
  });
  it("E=10 default split and trichome week", () => {
    const d = getDefaultStageOutline(10);
    expect(d).toMatchObject({
      seedling: { start: 1, end: 2 },
      veg: { start: 3, end: 4 },
      preflower: { start: 5, end: 5 },
      flower: { start: 6, end: 8 },
      ripening: { start: 9, end: 10 },
      trichomeWeek: 8,
      isShort: false,
    });
    expect(validateStageWeeks(d, 10, d.trichomeWeek)).toEqual({ valid: true, error: "" });
  });
  it("estimate clamps to 6..16 and short estimates carry the message", () => {
    expect(getDefaultStageOutline(3).estimateWeeks).toBe(6);
    expect(getDefaultStageOutline(40).estimateWeeks).toBe(16);
    expect(getDefaultStageOutline("x").estimateWeeks).toBe(10);
    const d7 = getDefaultStageOutline(7);
    expect(d7.isShort).toBe(true);
    expect(d7.shortMessage).toBe(
      "Short estimate: adjust the stage weeks to your breeder's description.",
    );
    for (const e of [6, 7, 8, 12, 16]) {
      const d = getDefaultStageOutline(e);
      expect(validateStageWeeks(d, e, d.trichomeWeek).valid).toBe(true);
    }
  });
  it("rejects overlapping, gapped, fractional and out-of-range stages", () => {
    const base = getDefaultStageOutline(10);
    expect(validateStageWeeks({ ...base, veg: { start: 3, end: 5 } }, 10, 8).valid).toBe(false);
    expect(validateStageWeeks({ ...base, veg: { start: 3, end: 3 } }, 10, 8).error).toMatch(
      /no gap/,
    );
    expect(validateStageWeeks({ ...base, veg: { start: 3, end: 4.5 } }, 10, 8).valid).toBe(false);
    expect(validateStageWeeks({ ...base, ripening: { start: 9, end: 11 } }, 10, 8).valid).toBe(
      false,
    );
    expect(validateStageWeeks(base, 10, 0).valid).toBe(false);
    expect(validateStageWeeks(base, 10, 11).valid).toBe(false);
  });
  it("milestone difference against planned week start", () => {
    expect(computeMilestoneDifference("2026-11-01", 5, "2026-12-03")).toBe("+4 days");
    expect(computeMilestoneDifference("2026-11-01", 5, "2026-11-28")).toBe("−1 day");
    expect(computeMilestoneDifference("2026-11-01", 5, "2026-11-29")).toBe("0 days");
    expect(computeMilestoneDifference("2026-11-01", 5, "")).toBe("");
    expect(computeMilestoneDifference("", 5, "2026-11-29")).toBe("");
  });
  it("current-week lookup uses the injected today", () => {
    const d = getDefaultStageOutline(10);
    expect(lookupCurrentWeekStatus("2026-11-01", "2026-11-10", 10, d)).toEqual({
      status: "Week 2 (Seedling)",
      week: 2,
      stage: "Seedling",
    });
    expect(lookupCurrentWeekStatus("2026-11-01", "2026-10-30", 10, d).status).toBe(
      "Not started yet",
    );
    expect(lookupCurrentWeekStatus("2026-11-01", "2027-01-10", 10, d).status).toBe(
      "Past your estimate",
    );
    expect(lookupCurrentWeekStatus("bad", "2026-11-10", 10, d).status).toBe("Invalid date");
  });
});

describe("autoflower week plan CSV guard", () => {
  it("quotes comma/quote/newline fields", () => {
    expect(escapeCsvField('First pistils, "top node"\n18/6')).toBe(
      '"First pistils, ""top node""\n18/6"',
    );
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(7)).toBe("7");
  });
  it("neutralises formula-leading cells", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(escapeCsvField(`${lead}SUM(A1)`).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(escapeCsvField("Week 1")).toBe("Week 1");
  });
});

describe("autoflower_planner_generated throttle", () => {
  it("emits on first call (null)", () => {
    expect(shouldEmitThrottled(null, 5_000)).toBe(true);
  });
  it("suppresses at 1999 ms", () => {
    expect(shouldEmitThrottled(10_000, 11_999)).toBe(false);
  });
  it("emits at 2000 ms", () => {
    expect(shouldEmitThrottled(10_000, 12_000)).toBe(true);
  });
});

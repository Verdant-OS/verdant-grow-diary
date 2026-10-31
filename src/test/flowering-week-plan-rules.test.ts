import { describe, expect, it } from "vitest";
import {
  FLOWERING_PLAN_FAQ,
  FLOWERING_QUICK_ANSWER,
  FLOWERING_SHORT_MESSAGE,
  addFloweringDays,
  buildFloweringPlanCsv,
  buildFloweringPlanTsv,
  clampFloweringWeeks,
  computeFloweringMilestoneDifference,
  computeFloweringSchedule,
  computeFloweringStretchSummary,
  computeFloweringWeek,
  countLoggedFloweringMilestones,
  createDefaultFloweringPlan,
  floweringLocalIsoDate,
  floweringPlanCsvFilename,
  floweringStageForWeek,
  getDefaultFloweringOutline,
  getPlannedFloweringMilestones,
  lookupFloweringCurrentWeek,
  parseFloweringIsoDate,
  validateFloweringStages,
  type FloweringPlanState,
} from "@/lib/floweringWeekPlanRules";

const DEF9 = getDefaultFloweringOutline(9);

describe("flowering date math (UTC midnight)", () => {
  it("rejects impossible and malformed dates", () => {
    expect(parseFloweringIsoDate("2026-02-30")).toBeNull();
    expect(parseFloweringIsoDate("2026-13-01")).toBeNull();
    expect(parseFloweringIsoDate("not-a-date")).toBeNull();
    expect(parseFloweringIsoDate("")).toBeNull();
    expect(parseFloweringIsoDate(null)).toBeNull();
    expect(addFloweringDays("2026-02-30", 1)).toBe("");
  });

  it("crosses month end, year end and a leap day", () => {
    expect(addFloweringDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addFloweringDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addFloweringDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addFloweringDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addFloweringDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(computeFloweringWeek("2026-12-28", 1)).toEqual({
      week: 1,
      startIso: "2026-12-28",
      endIso: "2027-01-03",
      labelRange: "Dec 28–Jan 3",
    });
    expect(computeFloweringWeek("2028-02-23", 1).endIso).toBe("2028-02-29");
  });

  it("formats the local calendar date of an injected clock", () => {
    expect(floweringLocalIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("source self-tests", () => {
  it("1. dates a 9-week flower from a December flip across the new year", () => {
    const sched = computeFloweringSchedule("2026-12-14", 9);
    expect(sched.weeks).toHaveLength(9);
    expect([sched.weeks[0].startIso, sched.weeks[0].endIso]).toEqual(["2026-12-14", "2026-12-20"]);
    expect([sched.weeks[8].startIso, sched.weeks[8].endIso]).toEqual(["2027-02-08", "2027-02-14"]);
    expect(sched.estimatedFinish).toBe("2027-02-14");
  });

  it("2. uses the 9-week default split with a week-7 trichome reminder", () => {
    expect(DEF9.stages).toEqual({
      transition: { start: 1, end: 3 },
      budset: { start: 4, end: 5 },
      bulking: { start: 6, end: 7 },
      ripening: { start: 8, end: 9 },
    });
    expect(DEF9.trichomeWeek).toBe(7);
    expect(computeFloweringWeek("2026-12-14", 7).startIso).toBe("2027-01-25");
  });

  it("3. rejects overlapping stages with the source message", () => {
    const result = validateFloweringStages(
      { ...DEF9.stages, budset: { start: 4, end: 6 }, bulking: { start: 6, end: 7 } },
      9,
      7,
    );
    expect(result).toEqual({
      valid: false,
      error:
        "Bud set (weeks 4–6) overlaps or is out of order with Bulking (weeks 6–7). Stages must be in order without overlapping.",
    });
  });

  it("4. signs milestone differences against the planned week start", () => {
    expect(computeFloweringMilestoneDifference("2026-12-14", 2, "2026-12-25")).toBe("+4 days");
    expect(computeFloweringMilestoneDifference("2026-12-14", 2, "2026-12-18")).toBe("−3 days");
    expect(computeFloweringMilestoneDifference("2026-12-14", 2, "2026-12-22")).toBe("+1 day");
    expect(computeFloweringMilestoneDifference("2026-12-14", 2, "2026-12-21")).toBe("0 days");
    expect(computeFloweringMilestoneDifference("2026-12-14", 2, "")).toBe("");
  });

  it("5. summarizes the stretch from two heights", () => {
    expect(computeFloweringStretchSummary(20, 36)).toBe("Stretch: +16.0 in (+80%)");
    expect(computeFloweringStretchSummary("30", "24")).toBe("Stretch: −6.0 in (−20%)");
    expect(computeFloweringStretchSummary("", 36)).toBe("");
    expect(computeFloweringStretchSummary(0, 36)).toBe("");
    expect(computeFloweringStretchSummary("abc", 36)).toBe("");
  });

  it("6. looks up today's week and stage, before the flip and after the estimate", () => {
    const w3 = lookupFloweringCurrentWeek("2026-12-14", "2026-12-30", 9, DEF9.stages);
    expect(w3).toEqual({
      status: "Week 3, Transition & stretch",
      week: 3,
      stage: "Transition & stretch",
    });
    expect(lookupFloweringCurrentWeek("2026-12-14", "2026-12-10", 9, DEF9.stages).status).toBe(
      "Not flipped yet",
    );
    expect(lookupFloweringCurrentWeek("2026-12-14", "2027-02-15", 9, DEF9.stages).status).toBe(
      "Past your breeder's estimate",
    );
    expect(lookupFloweringCurrentWeek("2026-12-14", "2027-02-14", 9, DEF9.stages).week).toBe(9);
    expect(lookupFloweringCurrentWeek("bad", "2027-02-14", 9, DEF9.stages).status).toBe(
      "Invalid date",
    );
  });

  it("7. compresses a short 7-week flower and flags it", () => {
    const def7 = getDefaultFloweringOutline(7);
    expect(def7.isShort).toBe(true);
    expect(def7.shortMessage).toBe(FLOWERING_SHORT_MESSAGE);
    expect(def7.stages).toEqual({
      transition: { start: 1, end: 2 },
      budset: { start: 3, end: 3 },
      bulking: { start: 4, end: 5 },
      ripening: { start: 6, end: 7 },
    });
    expect(def7.trichomeWeek).toBe(5);
    expect(getDefaultFloweringOutline(8).isShort).toBe(false);
  });

  it("8. quotes a CSV note with a comma, quotes and a newline as one field", () => {
    const plan: FloweringPlanState = {
      ...createDefaultFloweringPlan("2026-12-14"),
      milestones: {
        ...createDefaultFloweringPlan("2026-12-14").milestones,
        stretch_slows: { actualDate: "", note: 'Trellis tucked, "main cola"\nstretch slowed' },
      },
    };
    expect(buildFloweringPlanCsv(plan)).toContain(
      '"Trellis tucked, ""main cola""\nstretch slowed"',
    );
  });
});

describe("outline bounds and validation", () => {
  it("clamps flowering weeks to 6–16 and every default validates", () => {
    expect([clampFloweringWeeks(3), clampFloweringWeeks(40), clampFloweringWeeks("x")]).toEqual([
      6, 16, 9,
    ]);
    for (let f = 6; f <= 16; f++) {
      const outline = getDefaultFloweringOutline(f);
      expect(validateFloweringStages(outline.stages, f, outline.trichomeWeek)).toEqual({
        valid: true,
      });
    }
  });

  it("reports gaps, bounds, order and the trichome week", () => {
    const s = DEF9.stages;
    expect(validateFloweringStages({ ...s, budset: { start: 5, end: 5 } }, 9, 7)).toMatchObject({
      error: "Leave no gap between Transition & stretch (ends week 3) and Bud set (starts week 5).",
    });
    expect(validateFloweringStages({ ...s, ripening: { start: 8, end: 10 } }, 9, 7)).toMatchObject({
      error: "Ripening weeks must fit within weeks 1 to 9.",
    });
    expect(validateFloweringStages({ ...s, budset: { start: 5, end: 4 } }, 9, 7)).toMatchObject({
      error: "Bud set start week (5) cannot be after its end week (4).",
    });
    expect(validateFloweringStages(s, 9, 10)).toMatchObject({
      error: "Start checking trichomes week must be between week 1 and week 9.",
    });
    expect(validateFloweringStages({ ...s, ripening: { start: 8, end: 8 } }, 9, 7)).toMatchObject({
      error: "Stage weeks must start at week 1 and end at week 9.",
    });
  });

  it("maps weeks to stages", () => {
    expect([1, 3, 4, 5, 6, 7, 8, 9].map((w) => floweringStageForWeek(w, DEF9.stages))).toEqual([
      "Transition & stretch",
      "Transition & stretch",
      "Bud set",
      "Bud set",
      "Bulking",
      "Bulking",
      "Ripening",
      "Ripening",
    ]);
  });
});

describe("milestones and exports", () => {
  it("plans pistils at week 2, stretch at transition end, amber at the reminder and harvest at F", () => {
    expect(getPlannedFloweringMilestones(DEF9.stages, 7, 9)).toEqual({
      first_pistils: { weekLabel: "Week 2", startWeek: 2 },
      stretch_slows: { weekLabel: "Week 3", startWeek: 3 },
      first_amber: { weekLabel: "Week 7", startWeek: 7 },
      harvest: { weekLabel: "Week 9", startWeek: 9 },
    });
  });

  it("writes plan and milestone rows with the source headers", () => {
    const base = createDefaultFloweringPlan("2026-12-14");
    const plan: FloweringPlanState = {
      ...base,
      plantName: "Tent 1 – Plant A",
      flipHeight: "20",
      stretchSlowsHeight: "36",
      doneWeeks: { 1: true },
      milestones: { ...base.milestones, first_pistils: { actualDate: "2026-12-25", note: "" } },
    };
    expect(countLoggedFloweringMilestones(plan.milestones)).toBe(1);
    const rows = buildFloweringPlanCsv(plan).split("\r\n");
    expect(rows[0]).toBe(
      "Section,Plant,Week / Milestone,Dates / Planned Week,Stage / Actual Date,What to Watch and Log / Difference,Done / Note,Stretch Summary",
    );
    expect(rows).toHaveLength(1 + 9 + 4);
    expect(rows[1]).toBe(
      "Plan,Tent 1 – Plant A,Week 1,2026-12-14 to 2026-12-20,Transition & stretch,Watch for first pistils at the top nodes. Log height and the date you see them.,Yes,",
    );
    expect(rows[7]).toContain("(Milestone: Start checking trichomes)");
    expect(rows[10]).toBe(
      "Milestone,Tent 1 – Plant A,First pistils,Week 2 (starts 2026-12-21),2026-12-25,'+4 days,,",
    );
    expect(rows[11]).toBe(
      "Milestone,Tent 1 – Plant A,Stretch slows,Week 3 (starts 2026-12-28),,,,Stretch: +16.0 in (+80%)",
    );
    expect(buildFloweringPlanCsv({ ...base, plantName: "  " }).split("\r\n")[1]).toContain(
      "Plan,Photoperiod Plant,",
    );
  });

  it("guards CSV and TSV cells against spreadsheet formulas", () => {
    const base = createDefaultFloweringPlan("2026-12-14");
    const plan: FloweringPlanState = {
      ...base,
      plantName: "=HYPERLINK(1)",
      milestones: { ...base.milestones, harvest: { actualDate: "", note: "+cmd\tthen" } },
    };
    expect(buildFloweringPlanCsv(plan)).not.toMatch(/,=HYPERLINK/);
    const tsv = buildFloweringPlanTsv(plan).split("\n");
    expect(tsv[1].split("\t")[1]).toBe("'=HYPERLINK(1)");
    expect(tsv.at(-1)?.split("\t")[6]).toBe("'+cmd then");
    const withDiff = buildFloweringPlanTsv({
      ...base,
      milestones: { ...base.milestones, first_pistils: { actualDate: "2026-12-25", note: "" } },
    }).split("\n");
    expect(withDiff[10].split("\t")[5]).toBe("'+4 days");
  });

  it("names the CSV by local date", () => {
    expect(floweringPlanCsvFilename("2026-10-28")).toBe("flowering-plan-2026-10-28.csv");
  });
});

describe("copy", () => {
  it("quick answer and first FAQ give the same 9-week outline", () => {
    for (const text of [FLOWERING_QUICK_ANSWER, FLOWERING_PLAN_FAQ[0].answer]) {
      expect(text).toContain("weeks 1–3, 4–5, 6–7 and 8–9");
    }
    expect(FLOWERING_PLAN_FAQ).toHaveLength(6);
  });
});

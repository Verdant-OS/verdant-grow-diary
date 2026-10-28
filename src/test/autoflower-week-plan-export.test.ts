import { describe, expect, it } from "vitest";

import {
  AUTOFLOWER_WEEK_PLAN_CTA_HREF,
  AUTOFLOWER_WEEK_PLAN_FAQ,
  autoflowerPlanCsvFilename,
  autoflowerWeekPlanWebApplicationJsonLd,
  buildAutoflowerPlanCsv,
  buildAutoflowerPlanTsv,
  createDefaultAutoflowerPlan,
  countLoggedMilestones,
  getLightDisplayLabel,
  getPlannedMilestoneMeta,
  STAGE_GUIDANCE,
  validateStageWeeks,
  type AutoflowerPlanState,
} from "@/lib/autoflowerWeekPlanRules";

function plan(partial: Partial<AutoflowerPlanState> = {}): AutoflowerPlanState {
  return { ...createDefaultAutoflowerPlan("2026-11-01"), ...partial };
}

describe("autoflower plan defaults and labels", () => {
  it("defaults to E=10, 18/6, the guide outline and no milestones", () => {
    const state = createDefaultAutoflowerPlan("2026-11-01");
    expect(state.estimateWeeks).toBe(10);
    expect(state.lightCode).toBe("18_6");
    expect(state.lightCustomText).toBe("24/0 (custom)");
    expect(state.stages.flower).toEqual({ start: 6, end: 8 });
    expect(state.trichomeWeek).toBe(8);
    expect(countLoggedMilestones(state)).toBe(0);
  });

  it("labels light schedules as the source does", () => {
    expect(getLightDisplayLabel("18_6", "")).toBe("18/6 (18 hours on, 6 off)");
    expect(getLightDisplayLabel("20_4", "")).toBe("20/4 (20 hours on, 4 off)");
    expect(getLightDisplayLabel("other", " 24/0 ")).toBe("Other: 24/0");
    expect(getLightDisplayLabel("other", "  ")).toBe("Other (custom)");
  });

  it("keeps the source's overlap message in full", () => {
    const result = validateStageWeeks(
      {
        seedling: { start: 1, end: 2 },
        veg: { start: 3, end: 5 },
        preflower: { start: 5, end: 5 },
        flower: { start: 6, end: 8 },
        ripening: { start: 9, end: 10 },
      },
      10,
      8,
    );
    expect(result.error).toBe(
      "Veg (weeks 3–5) overlaps or is out of order with Pre-flower (weeks 5–5). Stages must be in order without overlapping.",
    );
  });

  it("plans milestone weeks, with stretch week capped at E-2", () => {
    const meta = getPlannedMilestoneMeta(plan());
    expect(meta.true_leaves).toEqual({ weekLabel: "Weeks 1–2", startWeek: 1 });
    expect(meta.first_pistils).toEqual({ weekLabel: "Week 5", startWeek: 5 });
    expect(meta.stretch_slows).toEqual({ weekLabel: "Week 8", startWeek: 8 });
    expect(meta.first_amber).toEqual({ weekLabel: "Week 8", startWeek: 8 });
    expect(meta.harvest).toEqual({ weekLabel: "Week 10", startWeek: 10 });
    const edited = getPlannedMilestoneMeta({
      estimateWeeks: 10,
      trichomeWeek: 8,
      stages: {
        seedling: { start: 1, end: 2 },
        veg: { start: 3, end: 6 },
        preflower: { start: 7, end: 8 },
        flower: { start: 9, end: 9 },
        ripening: { start: 10, end: 10 },
      },
    });
    expect(edited.stretch_slows).toEqual({ weekLabel: "Week 9", startWeek: 9 });
    const short = createDefaultAutoflowerPlan("2026-11-01", 6);
    expect(getPlannedMilestoneMeta(short).stretch_slows.startWeek).toBe(4);
    expect(getPlannedMilestoneMeta(short).true_leaves.weekLabel).toBe("Week 1");
  });
});

describe("autoflower plan export", () => {
  it("writes the source header, one row per week and five milestone rows", () => {
    const csv = buildAutoflowerPlanCsv(plan());
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "Section,Plant,Week / Milestone,Dates / Planned Week,Stage / Actual Date,Light / Difference,What to Check and Log / Note,Done",
    );
    expect(rows).toHaveLength(1 + 10 + 5);
    expect(rows[1]).toBe(
      `Plan,Autoflower,Week 1,2026-11-01 to 2026-11-07,Seedling,18/6 (18 hours on, 6 off),"${STAGE_GUIDANCE.Seedling}",No`.replace(
        "18/6 (18 hours on, 6 off)",
        '"18/6 (18 hours on, 6 off)"',
      ),
    );
    expect(rows[8]).toContain("[Milestone: Start checking trichomes]");
    expect(rows[10]).toContain("2027-01-03 to 2027-01-09");
  });

  it("records done weeks, actual dates, differences and notes", () => {
    const state = plan({
      plantName: "Auto #1",
      doneWeeks: { 1: true },
      milestones: {
        ...createDefaultAutoflowerPlan("2026-11-01").milestones,
        first_pistils: { actualDate: "2026-12-03", note: "top node, 'early'" },
      },
    });
    const rows = buildAutoflowerPlanCsv(state).split("\r\n");
    expect(rows[1].endsWith(",Yes")).toBe(true);
    expect(rows[1].startsWith("Plan,Auto #1,Week 1,")).toBe(true);
    expect(rows[12]).toBe(
      "Milestone,Auto #1,First pistils,Week 5 (starts 2026-11-29),2026-12-03,'+4 days,\"top node, 'early'\",",
    );
    expect(countLoggedMilestones(state)).toBe(1);
  });

  it("neutralizes formulas in grower text", () => {
    const csv = buildAutoflowerPlanCsv(plan({ plantName: "=cmd()" }));
    expect(csv.split("\r\n")[1].startsWith("Plan,'=cmd(),")).toBe(true);
  });

  it("flattens tabs and newlines in the TSV and uses the TSV milestone wording", () => {
    const state = plan({
      plantName: "A\tB",
      milestones: {
        ...createDefaultAutoflowerPlan("2026-11-01").milestones,
        harvest: { actualDate: "", note: "line1\nline2" },
      },
    });
    const lines = buildAutoflowerPlanTsv(state).split("\n");
    expect(lines).toHaveLength(16);
    expect(lines[1].split("\t")[1]).toBe("A B");
    expect(lines[8]).toContain("(Milestone: Start checking trichomes)");
    expect(lines[15].split("\t")[6]).toBe("line1 line2");
  });

  it("neutralizes formulas in the copied TSV without CSV quoting", () => {
    const state = plan({
      plantName: "=1+1",
      milestones: {
        ...createDefaultAutoflowerPlan("2026-11-01").milestones,
        first_pistils: { actualDate: "2026-12-03", note: "=SUM(1,2)" },
      },
    });
    const lines = buildAutoflowerPlanTsv(state).split("\n");
    expect(lines[1].split("\t")[1]).toBe("'=1+1");
    expect(lines[12].split("\t")[5]).toBe("'+4 days");
    expect(lines[12].split("\t")[6]).toBe("'=SUM(1,2)");
  });

  it("is deterministic and names the file from an injected date", () => {
    expect(buildAutoflowerPlanCsv(plan())).toBe(buildAutoflowerPlanCsv(plan()));
    expect(autoflowerPlanCsvFilename("2026-10-28")).toBe("autoflower-plan-2026-10-28.csv");
  });
});

describe("autoflower page metadata", () => {
  it("points CTAs at the guide's signup URL", () => {
    expect(AUTOFLOWER_WEEK_PLAN_CTA_HREF).toBe(
      "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=autoflower-week-by-week",
    );
  });

  it("keeps the six source FAQ questions", () => {
    expect(AUTOFLOWER_WEEK_PLAN_FAQ.map((entry) => entry.question)).toEqual([
      "When do autoflowers start flowering?",
      "What light schedule is best for autoflowers?",
      "How long do autoflowers take from seed to harvest?",
      "What should I feed my autoflower each week?",
      "Why is my autoflower so small?",
      "When should I start checking trichomes on an autoflower?",
    ]);
  });

  it("builds a free WebApplication with no rating", () => {
    const jsonLd = autoflowerWeekPlanWebApplicationJsonLd("https://example.test/x");
    expect(jsonLd.name).toBe("Autoflower Week-by-Week Planner");
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|review/i);
  });
});

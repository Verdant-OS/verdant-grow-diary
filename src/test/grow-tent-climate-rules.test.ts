import { describe, expect, it } from "vitest";
import {
  GROW_TENT_CLIMATE_STAGES,
  GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS,
  calculateGrowTentVpd,
  evaluateGrowTentBandStatus,
  calculateGrowTentNudgeRh,
  parseGrowTentClimateInputs,
  shouldEmitThrottled,
} from "@/lib/growTentClimateRules";
import { PUBLIC_VPD_CHART_STAGES } from "@/lib/publicVpdChartRules";
import { getVpdTargetBand } from "@/lib/vpdStageTargetRules";

describe("grow tent climate stage bands", () => {
  it("are the /vpd-chart bands (same objects, not copies)", () => {
    expect(GROW_TENT_CLIMATE_STAGES).toBe(PUBLIC_VPD_CHART_STAGES);
    expect(GROW_TENT_CLIMATE_STAGES.map((s) => [s.id, s.name, s.min, s.max])).toEqual([
      ["clone", "Clone/Seedling", 0.4, 0.8],
      ["veg", "Veg", 0.8, 1.2],
      ["early_flower", "Early Flower", 1.0, 1.5],
      ["late_flower", "Late Flower", 1.2, 1.6],
    ]);
  });

  it("match the /tools/vpd-calculator bands for each matching stage", () => {
    const pairs = [
      ["clone", "seedling"],
      ["veg", "veg"],
      ["early_flower", "flower"],
    ] as const;
    for (const [chartId, calcStage] of pairs) {
      const ours = GROW_TENT_CLIMATE_STAGES.find((s) => s.id === chartId)!;
      const calc = getVpdTargetBand(calcStage);
      expect([ours.min, ours.max]).toEqual([calc.min, calc.max]);
    }
  });

  it("pins the known late-flower split between the two site tools", () => {
    // Reported discrepancy: /vpd-chart (and the source HTML) use 1.2–1.6;
    // /tools/vpd-calculator uses 1.1–1.5. This page follows /vpd-chart.
    const ours = GROW_TENT_CLIMATE_STAGES.find((s) => s.id === "late_flower")!;
    const calc = getVpdTargetBand("late_flower");
    expect([ours.min, ours.max]).toEqual([1.2, 1.6]);
    expect([calc.min, calc.max]).toEqual([1.1, 1.5]);
  });
});

describe("calculateGrowTentVpd (source self-test pairs)", () => {
  it.each([
    [77, 60, -2, 1.06],
    [77, 60, 0, 1.27],
    [80, 45, -2, 1.7],
    [72, 75, -2, 0.49],
    [68, 70, 0, 0.7],
  ])("air %s°F, RH %s%%, offset %s°F gives %s kPa", (airF, rh, offset, expected) => {
    expect(calculateGrowTentVpd(airF, rh, offset)).toBeCloseTo(expected, 2);
  });

  it("is deterministic", () => {
    expect(calculateGrowTentVpd(77, 60, -2)).toBe(calculateGrowTentVpd(77, 60, -2));
  });
});

describe("evaluateGrowTentBandStatus", () => {
  it("treats band edges as within", () => {
    expect(evaluateGrowTentBandStatus(0.8, "veg").code).toBe("in_band");
    expect(evaluateGrowTentBandStatus(1.2, "veg").code).toBe("in_band");
    expect(evaluateGrowTentBandStatus(0.79, "veg").code).toBe("below");
    expect(evaluateGrowTentBandStatus(1.21, "veg").code).toBe("above");
  });

  it("carries the source copy", () => {
    expect(evaluateGrowTentBandStatus(1.03, "veg").fullText).toBe("Within your Veg band");
    expect(evaluateGrowTentBandStatus(0.9, "early_flower").fullText).toBe(
      "Below your Early Flower band: air is on the humid side",
    );
    expect(evaluateGrowTentBandStatus(1.7, "late_flower").fullText).toBe(
      "Above your Late Flower band: air is on the dry side",
    );
  });

  it("falls back to veg for an unknown stage", () => {
    expect(evaluateGrowTentBandStatus(1.0, "nope").fullText).toBe("Within your Veg band");
  });
});

describe("calculateGrowTentNudgeRh", () => {
  it("solves RH that lands on the band midpoint", () => {
    const nudge = calculateGrowTentNudgeRh(77, -2, "veg");
    expect(nudge.midpoint).toBe(1);
    expect(calculateGrowTentVpd(77, nudge.rhWhole, -2)).toBeCloseTo(1, 1);
  });

  it("clamps to 0–100", () => {
    expect(calculateGrowTentNudgeRh(50, 5, "late_flower").rhWhole).toBeGreaterThanOrEqual(0);
    expect(calculateGrowTentNudgeRh(100, -10, "clone").rhWhole).toBeLessThanOrEqual(100);
  });
});

describe("parseGrowTentClimateInputs", () => {
  it("accepts valid inputs and boundaries", () => {
    expect(parseGrowTentClimateInputs("77", "60", "-2", "veg").valid).toBe(true);
    expect(parseGrowTentClimateInputs("50", "0", "-10", "veg").valid).toBe(true);
    expect(parseGrowTentClimateInputs("100", "100", "5", "veg").valid).toBe(true);
  });

  it.each([
    ["", "60", "-2"],
    ["77", "", "-2"],
    ["77", "60", ""],
    ["49.9", "60", "-2"],
    ["100.1", "60", "-2"],
    ["77", "-1", "-2"],
    ["77", "101", "-2"],
    ["77", "60", "-10.1"],
    ["77", "60", "5.1"],
    ["abc", "60", "-2"],
    ["77", "NaN", "-2"],
  ])("rejects air=%j rh=%j offset=%j", (air, rh, offset) => {
    expect(parseGrowTentClimateInputs(air, rh, offset, "veg").valid).toBe(false);
  });

  it("normalises an unknown stage to veg", () => {
    expect(parseGrowTentClimateInputs("77", "60", "-2", "bogus").stageId).toBe("veg");
    expect(parseGrowTentClimateInputs("77", "60", "-2", "clone").stageId).toBe("clone");
  });
});

describe("shouldEmitThrottled", () => {
  it("uses a 2000 ms window by default", () => {
    expect(GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS).toBe(2000);
  });
  it("emits when nothing has been emitted yet", () => {
    expect(shouldEmitThrottled(null, 0)).toBe(true);
  });
  it("suppresses at 0 and 1999 ms, emits at 2000 ms", () => {
    expect(shouldEmitThrottled(1000, 1000)).toBe(false);
    expect(shouldEmitThrottled(1000, 2999)).toBe(false);
    expect(shouldEmitThrottled(1000, 3000)).toBe(true);
  });
  it("honours a custom window", () => {
    expect(shouldEmitThrottled(0, 499, 500)).toBe(false);
    expect(shouldEmitThrottled(0, 500, 500)).toBe(true);
  });
});

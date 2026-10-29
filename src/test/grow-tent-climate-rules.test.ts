import { describe, expect, it } from "vitest";
import {
  GROW_TENT_CLIMATE_STAGES,
  GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS,
  calculateGrowTentVpd,
  evaluateGrowTentBandStatus,
  calculateGrowTentNudgeRh,
  parseGrowTentClimateInputs,
  shouldEmitThrottled,
  GROW_TENT_CLIMATE_EXAMPLE_PAIRS,
  growTentExampleLines,
  GROW_TENT_CLIMATE_FAQ,
  GROW_TENT_CLIMATE_QUICK_ANSWER,
  buildGrowTentClimateCsv,
  buildGrowTentClimateReading,
  buildGrowTentClimateTsv,
  formatGrowTentDateTime,
  growTentBandBarGeometry,
  growTentClimateCsvFilename,
  growTentLocalDateTimeInput,
  summarizeGrowTentClimateLog,
  type GrowTentClimateReading,
  type GrowTentLights,
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

  it("reports an unreachable midpoint instead of claiming the clamped RH centers it", () => {
    const tooCold = calculateGrowTentNudgeRh(50, -10, "late_flower");
    expect(tooCold.reachable).toBe(false);
    expect(tooCold.rhWhole).toBe(0);
    expect(calculateGrowTentVpd(50, 0, -10)).toBeLessThan(1.2);
    const tooHot = calculateGrowTentNudgeRh(100, 5, "clone");
    expect(tooHot.reachable).toBe(false);
    expect(tooHot.rhWhole).toBe(100);
    expect(calculateGrowTentVpd(100, 100, 5)).toBeGreaterThan(0.8);
    expect(calculateGrowTentNudgeRh(77, -2, "veg").reachable).toBe(true);
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

function reading(
  id: number,
  airF: string,
  rh: string,
  offsetF: string,
  stage: string,
  lights: GrowTentLights = "Lights on",
  note = "",
): GrowTentClimateReading {
  const inputs = parseGrowTentClimateInputs(airF, rh, offsetF, stage);
  return buildGrowTentClimateReading(id, inputs, lights, "2026-10-28 09:00", note);
}

describe("example °F/RH pairs in the chart copy", () => {
  it("sit inside their stage band by the shared formula", () => {
    for (const stage of GROW_TENT_CLIMATE_STAGES) {
      const pairs = GROW_TENT_CLIMATE_EXAMPLE_PAIRS[stage.id];
      expect(pairs).toHaveLength(6);
      for (const pair of pairs) {
        const vpd = calculateGrowTentVpd(pair.airF, pair.rh, 0);
        expect(evaluateGrowTentBandStatus(vpd, stage.id).code).toBe("in_band");
      }
    }
  });

  it("render example lines with formula VPDs", () => {
    expect(growTentExampleLines("clone")).toEqual([
      "At 75°F: 85% RH (0.44 kPa), 80% RH (0.59 kPa), 75% RH (0.74 kPa)",
      "At 80°F: 85% RH (0.52 kPa), 82% RH (0.63 kPa), 78% RH (0.77 kPa)",
    ]);
    expect(growTentExampleLines("late_flower")[0]).toBe(
      "At 75°F: 59% RH (1.22 kPa), 53% RH (1.39 kPa), 47% RH (1.57 kPa)",
    );
  });

  it("quick answer and first FAQ state the same four bands as the stage table", () => {
    for (const text of [GROW_TENT_CLIMATE_QUICK_ANSWER, GROW_TENT_CLIMATE_FAQ[0].answer]) {
      expect(text).toContain("0.4–0.8 kPa");
      expect(text).toContain("0.8–1.2 for veg");
      expect(text).toContain("1.0–1.5 for early flower");
      expect(text).toContain("1.2–1.6 for late flower");
    }
    expect(GROW_TENT_CLIMATE_STAGES.map((s) => [s.min, s.max])).toEqual([
      [0.4, 0.8],
      [0.8, 1.2],
      [1.0, 1.5],
      [1.2, 1.6],
    ]);
  });
});

describe("climate readings and summary", () => {
  it("builds a reading with the source status text", () => {
    const r = reading(1, "77", "60", "-2", "veg", "Lights on", "  after raising exhaust ");
    expect(r).toMatchObject({
      vpd: 1.06,
      stageLabel: "Veg",
      statusCode: "in_band",
      statusText: "Within your Veg band",
      note: "after raising exhaust",
    });
  });

  it("summarizes an empty log without averages", () => {
    expect(summarizeGrowTentClimateLog([])).toEqual({
      total: 0,
      inBand: 0,
      below: 0,
      above: 0,
      overall: null,
      lightsOn: null,
      lightsOff: null,
    });
  });

  it("counts statuses and splits lights-on/off averages only when both exist", () => {
    const onOnly = [
      reading(1, "77", "60", "-2", "veg"),
      reading(2, "80", "45", "-2", "late_flower"),
    ];
    const s1 = summarizeGrowTentClimateLog(onOnly);
    expect([s1.inBand, s1.below, s1.above]).toEqual([1, 0, 1]);
    expect(s1.overall).toEqual({ count: 2, avgF: "78.5", avgRh: 53, avgVpd: "1.38" });
    expect(s1.lightsOn).toBeNull();

    const mixed = [...onOnly, reading(3, "72", "75", "-2", "veg", "Lights off")];
    const s2 = summarizeGrowTentClimateLog(mixed);
    expect(s2.below).toBe(1);
    expect(s2.lightsOn?.count).toBe(2);
    expect(s2.lightsOff).toEqual({ count: 1, avgF: "72.0", avgRh: 75, avgVpd: "0.49" });
  });
});

describe("climate log exports", () => {
  const header =
    "Date & Time,Lights,Air Temp (°F),RH (%),Leaf Offset (°F),Stage,VPD (kPa),Status,Note,Source";

  it("writes the source CSV header and quotes notes with commas, quotes and newlines", () => {
    const note = 'Raised exhaust, "lights off" check\ndrop 2F';
    const csv = buildGrowTentClimateCsv([reading(1, "77", "60", "-2", "veg", "Lights on", note)]);
    const [first, ...rest] = csv.split("\r\n");
    expect(first).toBe(header);
    expect(rest.join("\r\n")).toBe(
      '2026-10-28 09:00,Lights on,77,60,-2,Veg,1.06,Within your Veg band,"Raised exhaust, ""lights off"" check\ndrop 2F",manual',
    );
    expect(buildGrowTentClimateCsv([])).toBe(header);
  });

  it("guards CSV and TSV cells against spreadsheet formulas", () => {
    const csv = buildGrowTentClimateCsv([reading(1, "77", "60", "-2", "veg", "Lights on", "=1+1")]);
    expect(csv).not.toMatch(/,=1\+1/);
    const tsv = buildGrowTentClimateTsv([
      reading(1, "77", "60", "-2", "veg", "Lights on", "=SUM(1,2)"),
      reading(2, "77", "60", "-2", "veg", "Lights on", "+4 days\tlater"),
    ]);
    const lines = tsv.split("\n");
    expect(lines[0]).toBe(header.replaceAll(",", "\t"));
    expect(lines[1].split("\t")).toEqual([
      "2026-10-28 09:00",
      "Lights on",
      "77",
      "60",
      "-2",
      "Veg",
      "1.06",
      "Within your Veg band",
      "'=SUM(1,2)",
      "manual",
    ]);
    expect(lines[2].split("\t").at(-2)).toBe("'+4 days later");
  });

  it("names the CSV by local date", () => {
    expect(growTentClimateCsvFilename("2026-10-28")).toBe("tent-climate-log-2026-10-28.csv");
  });
});

describe("date/time and band bar", () => {
  it("formats the datetime-local value and falls back to the injected now", () => {
    const now = new Date(2026, 0, 5, 7, 4);
    expect(growTentLocalDateTimeInput(now)).toBe("2026-01-05T07:04");
    expect(formatGrowTentDateTime("2026-10-28T21:15", now)).toBe("2026-10-28 21:15");
    expect(formatGrowTentDateTime("  ", now)).toBe("2026-01-05 07:04");
    expect(formatGrowTentDateTime(null, now)).toBe("2026-01-05 07:04");
  });

  it("places the veg zone and marker on the 0–2.2 kPa scale and clamps the marker", () => {
    const g = growTentBandBarGeometry(1.06, "veg");
    expect(g.left.toFixed(2)).toBe("36.36");
    expect(g.width.toFixed(2)).toBe("18.18");
    expect(g.marker.toFixed(2)).toBe("48.18");
    expect(growTentBandBarGeometry(3.4, "veg").marker).toBe(100);
    expect(growTentBandBarGeometry(-0.2, "veg").marker).toBe(0);
  });
});

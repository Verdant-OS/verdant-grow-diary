import { describe, it, expect } from "vitest";
import {
  classifyTempAgainstStage,
  classifyRhAgainstStage,
  environmentMetricChipStatus,
  getTempTargetBand,
  getRhTargetBand,
} from "@/lib/environmentStageTargetRules";

describe("getTempTargetBand", () => {
  it.each([
    ["seedling", 22, 26],
    ["veg", 22, 28],
    ["preflower", 21, 27],
    ["flower", 20, 26],
    ["late_flower", 19, 25],
  ])("returns %s temp band", (stage, min, max) => {
    const b = getTempTargetBand(stage);
    expect(b.min).toBe(min);
    expect(b.max).toBe(max);
    expect(b.contextOnly).toBe(false);
  });

  it("harvest/drying returns context_only band", () => {
    const b = getTempTargetBand("harvest");
    expect(b.contextOnly).toBe(true);
    expect(b.min).toBeNull();
    expect(b.max).toBeNull();
    expect(getTempTargetBand("drying").contextOnly).toBe(true);
  });

  it("unknown/missing stage returns no active target", () => {
    expect(getTempTargetBand(null).stage).toBe("unknown");
    expect(getTempTargetBand(undefined).stage).toBe("unknown");
    expect(getTempTargetBand("bogus").stage).toBe("unknown");
  });
});

describe("getRhTargetBand", () => {
  it.each([
    ["seedling", 65, 75],
    ["veg", 55, 70],
    ["preflower", 50, 65],
    ["flower", 40, 55],
    ["late_flower", 35, 50],
  ])("returns %s RH band", (stage, min, max) => {
    const b = getRhTargetBand(stage);
    expect(b.min).toBe(min);
    expect(b.max).toBe(max);
  });

  it("harvest/drying returns context_only band", () => {
    expect(getRhTargetBand("harvest").contextOnly).toBe(true);
    expect(getRhTargetBand("drying").contextOnly).toBe(true);
  });
});

describe("classifyTempAgainstStage", () => {
  it("classifies below / in / above for veg (22–28°C)", () => {
    expect(classifyTempAgainstStage(20, { stage: "veg" }).classification).toBe("below_target");
    expect(classifyTempAgainstStage(25, { stage: "veg" }).classification).toBe("in_target");
    expect(classifyTempAgainstStage(30, { stage: "veg" }).classification).toBe("above_target");
  });

  it("boundary values stay in_target via deadband", () => {
    expect(classifyTempAgainstStage(22, { stage: "veg" }).classification).toBe("in_target");
    expect(classifyTempAgainstStage(28, { stage: "veg" }).classification).toBe("in_target");
  });

  it("never clamps the raw value", () => {
    expect(classifyTempAgainstStage(40, { stage: "flower" }).value).toBe(40);
  });

  it("unknown stage returns stage_unknown (not in_target)", () => {
    const r = classifyTempAgainstStage(24, { stage: null });
    expect(r.classification).toBe("stage_unknown");
  });

  it("harvest stage returns context_only", () => {
    expect(classifyTempAgainstStage(22, { stage: "harvest" }).classification).toBe("context_only");
    expect(classifyTempAgainstStage(22, { stage: "drying" }).classification).toBe("context_only");
  });

  it("null / NaN / Infinity return unavailable", () => {
    expect(classifyTempAgainstStage(null, { stage: "veg" }).classification).toBe("unavailable");
    expect(classifyTempAgainstStage(undefined, { stage: "veg" }).classification).toBe("unavailable");
    expect(classifyTempAgainstStage(Number.NaN, { stage: "veg" }).classification).toBe("unavailable");
    expect(classifyTempAgainstStage(Number.POSITIVE_INFINITY, { stage: "veg" }).classification).toBe("unavailable");
  });

  it("stale readings never map to ok", () => {
    const r = classifyTempAgainstStage(25, { stage: "veg", stale: true });
    expect(r.classification).toBe("in_target"); // classification preserved
    expect(r.stale).toBe(true);
    expect(environmentMetricChipStatus(r)).toBe("warn");
    expect(r.historical).toBe(true);
    expect(r.label).toContain("historical");
  });
});

describe("classifyRhAgainstStage", () => {
  it("classifies below / in / above for flower (40–55%)", () => {
    expect(classifyRhAgainstStage(30, { stage: "flower" }).classification).toBe("below_target");
    expect(classifyRhAgainstStage(50, { stage: "flower" }).classification).toBe("in_target");
    expect(classifyRhAgainstStage(70, { stage: "flower" }).classification).toBe("above_target");
  });

  it("boundary values stay in_target via deadband", () => {
    expect(classifyRhAgainstStage(40, { stage: "flower" }).classification).toBe("in_target");
    expect(classifyRhAgainstStage(55, { stage: "flower" }).classification).toBe("in_target");
  });

  it("unknown stage returns stage_unknown", () => {
    expect(classifyRhAgainstStage(60, { stage: undefined }).classification).toBe("stage_unknown");
  });

  it("harvest stage returns context_only", () => {
    expect(classifyRhAgainstStage(60, { stage: "harvest" }).classification).toBe("context_only");
  });

  it("null / NaN / Infinity return unavailable", () => {
    expect(classifyRhAgainstStage(null, { stage: "veg" }).classification).toBe("unavailable");
    expect(classifyRhAgainstStage(Number.NaN, { stage: "veg" }).classification).toBe("unavailable");
    expect(classifyRhAgainstStage(Number.POSITIVE_INFINITY, { stage: "veg" }).classification).toBe("unavailable");
  });

  it("stale readings never map to ok", () => {
    const r = classifyRhAgainstStage(60, { stage: "veg", stale: true });
    expect(environmentMetricChipStatus(r)).toBe("warn");
  });
});

describe("environmentMetricChipStatus", () => {
  it("in_target -> ok", () => {
    expect(environmentMetricChipStatus(classifyTempAgainstStage(25, { stage: "veg" }))).toBe("ok");
  });
  it("below/above -> warn", () => {
    expect(environmentMetricChipStatus(classifyTempAgainstStage(10, { stage: "veg" }))).toBe("warn");
    expect(environmentMetricChipStatus(classifyTempAgainstStage(40, { stage: "veg" }))).toBe("warn");
  });
  it("unavailable/stage_unknown/context_only -> warn (never ok)", () => {
    expect(environmentMetricChipStatus(classifyTempAgainstStage(null, { stage: "veg" }))).toBe("warn");
    expect(environmentMetricChipStatus(classifyTempAgainstStage(25, { stage: null }))).toBe("warn");
    expect(environmentMetricChipStatus(classifyTempAgainstStage(25, { stage: "harvest" }))).toBe("warn");
  });
});

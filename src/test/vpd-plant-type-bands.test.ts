/**
 * Step 2 of the autoflower/photoperiod plan (locked 2026-07-21): plant-type
 * aware VPD bands. Photoperiod and omitted plantType reproduce the historical
 * bands exactly; autoflower and explicitly-unknown types hold the stable
 * lower side (seedling ≤ 0.7, mid ≤ 1.1, flower ≤ 1.35 kPa).
 * The pinned historical numbers live in vpd-stage-target-rules.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  classifyVpdAgainstStage,
  getVpdTargetBand,
  type VpdStage,
} from "@/lib/vpdStageTargetRules";

const STAGES: VpdStage[] = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
  "harvest",
  "unknown",
];

describe("getVpdTargetBand with plantType", () => {
  it("photoperiod returns the existing bands unchanged, byte-for-byte", () => {
    for (const stage of STAGES) {
      expect(getVpdTargetBand(stage, "photoperiod")).toEqual(getVpdTargetBand(stage));
    }
  });

  it("omitting plantType (every legacy caller) keeps historical behavior", () => {
    const legacy = getVpdTargetBand("flower");
    expect(legacy.min).toBe(1.0);
    expect(legacy.max).toBe(1.5);
    expect(getVpdTargetBand("flower", null)).toEqual(legacy);
  });

  it("autoflower and unknown cap the band tops on the locked lower side", () => {
    for (const type of ["autoflower", "unknown"] as const) {
      expect(getVpdTargetBand("seedling", type).max).toBeLessThanOrEqual(0.7);
      expect(getVpdTargetBand("veg", type).max).toBeLessThanOrEqual(1.1);
      expect(getVpdTargetBand("preflower", type).max).toBeLessThanOrEqual(1.1);
      expect(getVpdTargetBand("flower", type).max).toBeLessThanOrEqual(1.35);
      expect(getVpdTargetBand("late_flower", type).max).toBeLessThanOrEqual(1.35);
      expect(getVpdTargetBand("unknown", type).max).toBeLessThanOrEqual(1.2);
    }
  });

  it("mins are unchanged and every capped band stays well-formed (min < max)", () => {
    for (const stage of STAGES) {
      const legacy = getVpdTargetBand(stage);
      const auto = getVpdTargetBand(stage, "autoflower");
      expect(auto.min).toBe(legacy.min);
      if (auto.min !== null && auto.max !== null) {
        expect(auto.min).toBeLessThan(auto.max);
      }
    }
  });

  it("helper text for auto/unknown notes the stable lower-side preference", () => {
    expect(getVpdTargetBand("veg", "autoflower").helper).toMatch(/stable lower side/);
    expect(getVpdTargetBand("veg", "unknown").helper).toMatch(/stable lower side/);
    expect(getVpdTargetBand("veg", "photoperiod").helper).not.toMatch(/stable lower side/);
    expect(getVpdTargetBand("veg").helper).not.toMatch(/stable lower side/);
  });

  it("harvest stays context-only with null bounds for every type", () => {
    for (const type of [undefined, "photoperiod", "autoflower", "unknown"] as const) {
      const band = getVpdTargetBand("harvest", type);
      expect(band.contextOnly).toBe(true);
      expect(band.min).toBeNull();
      expect(band.max).toBeNull();
    }
  });

  it("unrecognized plantType strings fall to the conservative unknown side", () => {
    expect(getVpdTargetBand("flower", "not sure").max).toBeLessThanOrEqual(1.35);
  });
});

describe("classifyVpdAgainstStage with plantType", () => {
  it("the same value can be in-target for photoperiod and above-target for autoflower", () => {
    const photo = classifyVpdAgainstStage({ value: 1.45, stage: "flower", plantType: "photoperiod" });
    const auto = classifyVpdAgainstStage({ value: 1.45, stage: "flower", plantType: "autoflower" });
    expect(photo.classification).toBe("in_target");
    expect(auto.classification).toBe("above_target");
  });

  it("invalid / missing VPD still nulls out identically regardless of type", () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = classifyVpdAgainstStage({ value, stage: "veg", plantType: "autoflower" });
      expect(r.classification).toBe("unavailable");
      expect(r.value).toBeNull();
    }
  });

  it("stale readings stay historical and never upgrade, with or without type", () => {
    const r = classifyVpdAgainstStage({
      value: 1.0,
      stage: "veg",
      stale: true,
      plantType: "autoflower",
    });
    expect(r.historical).toBe(true);
    expect(r.label).toMatch(/historical, stale reading/);
  });

  it("raw values are never clamped in the type-aware path", () => {
    const r = classifyVpdAgainstStage({ value: 3.2, stage: "veg", plantType: "unknown" });
    expect(r.value).toBe(3.2);
    expect(r.classification).toBe("above_target");
  });
});

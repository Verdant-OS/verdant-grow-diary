/**
 * Tests for blueprintMetricRules — the pure green/amber/red evaluator that
 * scores a reading against its per-stage Pro Blueprint target band, keyed off
 * the real `plants.stage` vocabulary via the live `normalizeVpdStage`.
 */
import { describe, it, expect } from "vitest";

import {
  classifyReadingAgainstBand,
  evaluateBlueprintMetric,
  resolveBlueprintBand,
  resolveDayNightBand,
  DEFAULT_WARN_MARGIN,
} from "@/lib/blueprintMetricRules";
import { SOP_BLUEPRINT_TARGETS } from "@/constants/blueprintTargets";
import { getVpdTargetBand } from "@/lib/vpdStageTargetRules";

describe("DEFAULT_WARN_MARGIN", () => {
  it("is 0.15 (15% of band width)", () => {
    expect(DEFAULT_WARN_MARGIN).toBe(0.15);
  });
});

describe("classifyReadingAgainstBand", () => {
  const band = { min: 1.0, max: 2.0 }; // width 1.0 → default margin 0.15

  it("scores a value inside the band as in_band / green / healthy", () => {
    const r = classifyReadingAgainstBand(1.5, band);
    expect(r.classification).toBe("in_band");
    expect(r.tone).toBe("green");
    expect(r.healthy).toBe(true);
    expect(r.band).toEqual(band);
  });

  it("treats both edges as inclusive (in_band)", () => {
    expect(classifyReadingAgainstBand(1.0, band).classification).toBe("in_band");
    expect(classifyReadingAgainstBand(2.0, band).classification).toBe("in_band");
  });

  it("flags just-below as warn_low / amber and far-below as out_low / red", () => {
    expect(classifyReadingAgainstBand(0.9, band).classification).toBe("warn_low");
    expect(classifyReadingAgainstBand(0.9, band).tone).toBe("amber");
    expect(classifyReadingAgainstBand(0.5, band).classification).toBe("out_low");
    expect(classifyReadingAgainstBand(0.5, band).tone).toBe("red");
  });

  it("flags just-above as warn_high / amber and far-above as out_high / red", () => {
    expect(classifyReadingAgainstBand(2.1, band).classification).toBe("warn_high");
    expect(classifyReadingAgainstBand(2.5, band).classification).toBe("out_high");
  });

  it("splits the amber margin from the red zone (within margin vs past it)", () => {
    expect(classifyReadingAgainstBand(0.86, band).classification).toBe("warn_low");
    expect(classifyReadingAgainstBand(0.83, band).classification).toBe("out_low");
  });

  it("returns no_target / neutral when there is no band", () => {
    for (const missing of [null, undefined]) {
      const r = classifyReadingAgainstBand(1.5, missing);
      expect(r.classification).toBe("no_target");
      expect(r.tone).toBe("neutral");
      expect(r.band).toBeNull();
    }
  });

  it("returns unavailable / neutral for a missing or non-finite value", () => {
    for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = classifyReadingAgainstBand(bad as number | null | undefined, band);
      expect(r.classification).toBe("unavailable");
      expect(r.band).toEqual(band);
    }
  });

  it("handles a degenerate zero-width band (any deviation is red)", () => {
    const point = { min: 5, max: 5 };
    expect(classifyReadingAgainstBand(5, point).classification).toBe("in_band");
    expect(classifyReadingAgainstBand(5.001, point).classification).toBe("out_high");
    expect(classifyReadingAgainstBand(4.999, point).classification).toBe("out_low");
  });

  it("respects a custom warnMargin and clamps a negative one to zero", () => {
    expect(classifyReadingAgainstBand(0.6, band, 0.5).classification).toBe("warn_low");
    expect(classifyReadingAgainstBand(0.99, band, -1).classification).toBe("out_low");
  });
});

describe("resolveDayNightBand", () => {
  const dn = { day: { min: 24, max: 27 }, night: { min: 19, max: 22 } };
  it("picks day / night by the flag", () => {
    expect(resolveDayNightBand(dn, true)).toEqual({ min: 24, max: 27 });
    expect(resolveDayNightBand(dn, false)).toEqual({ min: 19, max: 22 });
  });
  it("merges to the widest range when the light state is unknown", () => {
    expect(resolveDayNightBand(dn, null)).toEqual({ min: 19, max: 27 });
    expect(resolveDayNightBand(dn, undefined)).toEqual({ min: 19, max: 27 });
  });
});

describe("resolveBlueprintBand", () => {
  it("single-sources VPD from getVpdTargetBand (not the Blueprint table)", () => {
    const t = getVpdTargetBand("flower"); // 1.0-1.5
    expect(resolveBlueprintBand("flower", "vpdKpa")).toEqual({ min: t.min, max: t.max });
    // context-only stages (harvest) have no VPD target
    expect(resolveBlueprintBand("harvest", "vpdKpa")).toBeNull();
    // and the Blueprint table carries no vpd band on any stage
    for (const stage of Object.keys(SOP_BLUEPRINT_TARGETS)) {
      const bands = (SOP_BLUEPRINT_TARGETS as Record<string, Record<string, unknown>>)[stage];
      expect(bands.vpdKpa).toBeUndefined();
    }
  });

  it("resolves the day/night temperature band by the light flag", () => {
    // veg tempC day 24-27 / night 19-22
    expect(resolveBlueprintBand("veg", "tempC", { isDay: true })).toEqual({ min: 24, max: 27 });
    expect(resolveBlueprintBand("veg", "tempC", { isDay: false })).toEqual({ min: 19, max: 22 });
    expect(resolveBlueprintBand("veg", "tempC", { isDay: null })).toEqual({ min: 19, max: 27 });
  });

  it("resolves non-temp metrics from the Blueprint table", () => {
    expect(resolveBlueprintBand("seedling", "ec")).toEqual(SOP_BLUEPRINT_TARGETS.seedling.ec);
  });

  it("gives harvest real dry-room temp/RH bands (the SOP's Dry & Cure value)", () => {
    expect(resolveBlueprintBand("harvest", "tempC", { isDay: true })).toEqual({ min: 15, max: 16 });
    expect(resolveBlueprintBand("harvest", "rh")).toEqual({ min: 58, max: 62 });
    // but no root-zone / light targets post-harvest
    expect(resolveBlueprintBand("harvest", "ec")).toBeNull();
    expect(resolveBlueprintBand("harvest", "dli")).toBeNull();
  });

  it("returns null for a metric with no band at the stage, and for unknown stage", () => {
    expect(resolveBlueprintBand("seedling", "dli")).toBeNull(); // seedling has no DLI
    expect(resolveBlueprintBand("unknown", "ec")).toBeNull();
  });
});

describe("evaluateBlueprintMetric — real plants.stage vocabulary", () => {
  it("returns stage_unknown for unknown / malformed stages", () => {
    for (const stage of ["banana", "", "  ", null, undefined]) {
      const r = evaluateBlueprintMetric({ stage, metricKey: "ec", value: 1.5 });
      expect(r.classification).toBe("stage_unknown");
      expect(r.band).toBeNull();
    }
  });

  it("maps flush → late_flower (a real plants.stage value)", () => {
    // late_flower ec band 1.0-1.6; a flush EC of 1.3 is in band
    expect(
      evaluateBlueprintMetric({ stage: "flush", metricKey: "ec", value: 1.3 }).classification,
    ).toBe("in_band");
  });

  it("maps harvest AND cure → dry-room targets (not stage_unknown)", () => {
    for (const stage of ["harvest", "cure"]) {
      // dry-room RH band 58-62
      expect(evaluateBlueprintMetric({ stage, metricKey: "rh", value: 60 }).classification).toBe(
        "in_band",
      );
      // temp 20 is above the 15-16 dry band → red
      expect(evaluateBlueprintMetric({ stage, metricKey: "tempC", value: 20 }).classification).toBe(
        "out_high",
      );
      // VPD is context-only in dry/cure → no_target
      expect(
        evaluateBlueprintMetric({ stage, metricKey: "vpdKpa", value: 1.0 }).classification,
      ).toBe("no_target");
    }
  });

  it("scores VPD from the live per-stage VPD band", () => {
    // seedling VPD band 0.4-0.8
    expect(
      evaluateBlueprintMetric({ stage: "seedling", metricKey: "vpdKpa", value: 0.6 })
        .classification,
    ).toBe("in_band");
  });

  it("applies day/night temperature bands via isDay", () => {
    // veg night band 19-22; 21 in band at night, but out_low vs day band 24-27
    expect(
      evaluateBlueprintMetric({ stage: "veg", metricKey: "tempC", value: 21, isDay: false })
        .classification,
    ).toBe("in_band");
    expect(
      evaluateBlueprintMetric({ stage: "veg", metricKey: "tempC", value: 21, isDay: true })
        .classification,
    ).toBe("out_low");
  });

  it("returns unavailable for a missing value within a known stage", () => {
    expect(
      evaluateBlueprintMetric({ stage: "seedling", metricKey: "ph", value: null }).classification,
    ).toBe("unavailable");
  });
});

describe("SOP_BLUEPRINT_TARGETS integrity", () => {
  const stages = ["seedling", "veg", "preflower", "flower", "late_flower", "harvest"] as const;

  it("defines every normalized target stage", () => {
    for (const s of stages) expect(SOP_BLUEPRINT_TARGETS[s]).toBeDefined();
    expect(Object.keys(SOP_BLUEPRINT_TARGETS).sort()).toEqual([...stages].sort());
  });

  it("has finite min < max for every defined band (incl. day/night temp)", () => {
    for (const s of stages) {
      const b = SOP_BLUEPRINT_TARGETS[s];
      if (b.tempC) {
        for (const dn of [b.tempC.day, b.tempC.night]) {
          expect(Number.isFinite(dn.min) && Number.isFinite(dn.max)).toBe(true);
          expect(dn.min).toBeLessThanOrEqual(dn.max);
        }
      }
      for (const key of ["rh", "ec", "ph", "ppfd", "dli"] as const) {
        const band = b[key];
        if (!band) continue;
        expect(Number.isFinite(band.min) && Number.isFinite(band.max)).toBe(true);
        expect(band.min, `${s}.${key}`).toBeLessThan(band.max);
      }
    }
  });
});

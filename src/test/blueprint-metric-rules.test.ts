/**
 * Tests for blueprintMetricRules — the pure green/amber/red evaluator that
 * scores a reading against its per-stage Pro Blueprint target band.
 */
import { describe, it, expect } from "vitest";

import {
  classifyReadingAgainstBand,
  evaluateBlueprintMetric,
  resolveBlueprintBand,
  DEFAULT_WARN_MARGIN,
  type BlueprintMetricResult,
} from "@/lib/blueprintMetricRules";
import { SOP_BLUEPRINT_TARGETS, type BlueprintStageBands } from "@/constants/blueprintTargets";
import { VPD_STAGE_TARGETS } from "@/constants/vpdTargets";
import { CANONICAL_VPD_TARGET_STAGES } from "@/lib/vpdStageNormalizationRules";

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

  it("flags just-below the band as warn_low / amber", () => {
    const r = classifyReadingAgainstBand(0.9, band); // 0.1 below, ≤ 0.15
    expect(r.classification).toBe("warn_low");
    expect(r.tone).toBe("amber");
    expect(r.healthy).toBe(false);
  });

  it("flags far-below the band as out_low / red", () => {
    const r = classifyReadingAgainstBand(0.5, band); // 0.5 below, > 0.15
    expect(r.classification).toBe("out_low");
    expect(r.tone).toBe("red");
  });

  it("flags just-above the band as warn_high / amber", () => {
    const r = classifyReadingAgainstBand(2.1, band); // 0.1 above, ≤ 0.15
    expect(r.classification).toBe("warn_high");
    expect(r.tone).toBe("amber");
  });

  it("flags far-above the band as out_high / red", () => {
    const r = classifyReadingAgainstBand(2.5, band);
    expect(r.classification).toBe("out_high");
    expect(r.tone).toBe("red");
  });

  it("splits the amber margin from the red zone (within margin vs past it)", () => {
    // width 1.0, margin 0.15 → 0.86 sits within the margin, 0.83 is past it
    expect(classifyReadingAgainstBand(0.86, band).classification).toBe("warn_low");
    expect(classifyReadingAgainstBand(0.83, band).classification).toBe("out_low");
  });

  it("returns no_target / neutral when there is no band", () => {
    for (const missing of [null, undefined]) {
      const r = classifyReadingAgainstBand(1.5, missing);
      expect(r.classification).toBe("no_target");
      expect(r.tone).toBe("neutral");
      expect(r.healthy).toBe(false);
      expect(r.band).toBeNull();
    }
  });

  it("returns unavailable / neutral for a missing or non-finite value", () => {
    for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = classifyReadingAgainstBand(bad as number | null | undefined, band);
      expect(r.classification).toBe("unavailable");
      expect(r.tone).toBe("neutral");
      expect(r.healthy).toBe(false);
      // band is preserved so the UI can still show the target
      expect(r.band).toEqual(band);
    }
  });

  it("handles a degenerate zero-width band (any deviation is red)", () => {
    const point = { min: 5, max: 5 };
    expect(classifyReadingAgainstBand(5, point).classification).toBe("in_band");
    expect(classifyReadingAgainstBand(5.001, point).classification).toBe("out_high");
    expect(classifyReadingAgainstBand(4.999, point).classification).toBe("out_low");
  });

  it("respects a custom warnMargin", () => {
    // margin 0.5 → 0.6 (0.4 below) is now amber, not red
    expect(classifyReadingAgainstBand(0.6, band, 0.5).classification).toBe("warn_low");
  });

  it("clamps a negative warnMargin to zero", () => {
    expect(classifyReadingAgainstBand(0.99, band, -1).classification).toBe("out_low");
  });
});

describe("resolveBlueprintBand", () => {
  it("single-sources VPD from VPD_STAGE_TARGETS (not the Blueprint table)", () => {
    const t = VPD_STAGE_TARGETS.mid_late_flower;
    expect(resolveBlueprintBand("mid_late_flower", "vpdKpa")).toEqual({
      min: t.minKpa,
      max: t.maxKpa,
    });
    // and the Blueprint table deliberately carries no vpd band
    expect(
      (SOP_BLUEPRINT_TARGETS.mid_late_flower as Record<string, unknown>).vpdKpa,
    ).toBeUndefined();
  });

  it("resolves the six non-VPD metrics from the Blueprint table", () => {
    expect(resolveBlueprintBand("seedling", "ec")).toEqual(SOP_BLUEPRINT_TARGETS.seedling.ec);
  });

  it("returns null when a metric has no band for the stage", () => {
    // seedling intentionally has no DLI band
    expect(resolveBlueprintBand("seedling", "dli")).toBeNull();
  });

  it("honors an override band table", () => {
    const custom = {
      ...SOP_BLUEPRINT_TARGETS,
      seedling: { ...SOP_BLUEPRINT_TARGETS.seedling, ec: { min: 9, max: 10 } },
    };
    expect(resolveBlueprintBand("seedling", "ec", custom)).toEqual({ min: 9, max: 10 });
  });
});

describe("evaluateBlueprintMetric", () => {
  it("returns stage_unknown for unknown / malformed stages", () => {
    for (const stage of ["banana", "", "  ", "VEG", "Veg", null, undefined]) {
      const r = evaluateBlueprintMetric({ stage, metricKey: "ec", value: 1.5 });
      expect(r.classification).toBe("stage_unknown");
      expect(r.healthy).toBe(false);
      expect(r.band).toBeNull();
    }
  });

  it("maps legacy stage names to canonical before lookup", () => {
    // legacy "flower" → canonical mid_late_flower; VPD band {1.1, 1.5}
    const r = evaluateBlueprintMetric({ stage: "flower", metricKey: "vpdKpa", value: 1.3 });
    expect(r.classification).toBe("in_band");
    expect(r.healthy).toBe(true);
  });

  it("scores VPD from the canonical VPD targets", () => {
    // seedling VPD band {0.4, 0.8}
    expect(
      evaluateBlueprintMetric({ stage: "seedling", metricKey: "vpdKpa", value: 0.6 })
        .classification,
    ).toBe("in_band");
  });

  it("scores a non-VPD metric against its Blueprint band (amber/red)", () => {
    // seedling EC band {0.6, 0.8}, width 0.2 → margin 0.03
    expect(
      evaluateBlueprintMetric({ stage: "seedling", metricKey: "ec", value: 0.7 }).classification,
    ).toBe("in_band");
    expect(
      evaluateBlueprintMetric({ stage: "seedling", metricKey: "ec", value: 0.58 }).classification,
    ).toBe("warn_low"); // 0.02 below ≤ 0.03
    expect(
      evaluateBlueprintMetric({ stage: "seedling", metricKey: "ec", value: 0.5 }).classification,
    ).toBe("out_low"); // 0.1 below > 0.03
  });

  it("returns no_target for a metric with no band at that stage", () => {
    const r = evaluateBlueprintMetric({ stage: "seedling", metricKey: "dli", value: 30 });
    expect(r.classification).toBe("no_target");
  });

  it("returns unavailable for a missing value within a known stage", () => {
    const r = evaluateBlueprintMetric({ stage: "seedling", metricKey: "tempC", value: null });
    expect(r.classification).toBe("unavailable");
  });
});

describe("SOP_BLUEPRINT_TARGETS integrity", () => {
  it("defines all six canonical stages", () => {
    for (const stage of CANONICAL_VPD_TARGET_STAGES) {
      expect(SOP_BLUEPRINT_TARGETS[stage]).toBeDefined();
    }
    expect(Object.keys(SOP_BLUEPRINT_TARGETS).sort()).toEqual(
      [...CANONICAL_VPD_TARGET_STAGES].sort(),
    );
  });

  it("never carries a vpd band (VPD is single-sourced)", () => {
    for (const stage of CANONICAL_VPD_TARGET_STAGES) {
      const bands = SOP_BLUEPRINT_TARGETS[stage] as Record<string, unknown>;
      expect(bands.vpdKpa).toBeUndefined();
      expect(bands.vpd).toBeUndefined();
    }
  });

  it("has every defined band as a finite min < max range", () => {
    const metricKeys: (keyof BlueprintStageBands)[] = ["tempC", "rh", "ec", "ph", "ppfd", "dli"];
    for (const stage of CANONICAL_VPD_TARGET_STAGES) {
      const bands = SOP_BLUEPRINT_TARGETS[stage];
      for (const key of metricKeys) {
        const band = bands[key];
        if (!band) continue;
        expect(Number.isFinite(band.min), `${stage}.${key}.min`).toBe(true);
        expect(Number.isFinite(band.max), `${stage}.${key}.max`).toBe(true);
        expect(band.min, `${stage}.${key} min<max`).toBeLessThan(band.max);
      }
    }
  });
});

// Type-only sanity: the result shape stays stable.
const _typecheck: BlueprintMetricResult = classifyReadingAgainstBand(1, { min: 0, max: 2 });
void _typecheck;

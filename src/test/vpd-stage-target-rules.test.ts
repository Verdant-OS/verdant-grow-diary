/**
 * Tests for src/lib/vpdStageTargetRules.ts — stage-aware VPD foundation v1.
 *
 * Covers all stages, exact boundary determinism with the deadband, stale
 * handling, unknown/harvest semantics, no value clamping, deterministic
 * output, and the helper's safety contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyVpdAgainstStage,
  getVpdTargetBand,
  normalizeVpdStage,
  vpdMetricChipStatus,
  VPD_DEADBAND_KPA,
  VPD_STAGE_HELPER_TEXT,
  type VpdStage,
} from "@/lib/vpdStageTargetRules";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/vpdStageTargetRules.ts"),
  "utf8",
);

const EXPECTED: Record<VpdStage, { min: number | null; max: number | null }> = {
  seedling: { min: 0.4, max: 0.8 },
  veg: { min: 0.8, max: 1.2 },
  preflower: { min: 0.9, max: 1.3 },
  flower: { min: 1.0, max: 1.5 },
  late_flower: { min: 1.1, max: 1.5 },
  harvest: { min: null, max: null },
  unknown: { min: 0.8, max: 1.4 },
};

describe("getVpdTargetBand", () => {
  for (const [stage, range] of Object.entries(EXPECTED) as [
    VpdStage,
    { min: number | null; max: number | null },
  ][]) {
    it(`returns conservative range for ${stage}`, () => {
      const band = getVpdTargetBand(stage);
      expect(band.stage).toBe(stage);
      expect(band.min).toBe(range.min);
      expect(band.max).toBe(range.max);
      expect(band.helper).toContain("VPD targets depend on plant stage");
    });
  }

  it("harvest is contextOnly with no active target", () => {
    const band = getVpdTargetBand("harvest");
    expect(band.contextOnly).toBe(true);
    expect(band.min).toBeNull();
    expect(band.max).toBeNull();
  });

  it("unknown stage uses wide default and stage-unknown copy", () => {
    const band = getVpdTargetBand(null);
    expect(band.stage).toBe("unknown");
    expect(band.helper.toLowerCase()).toContain("stage unknown");
  });
});

describe("normalizeVpdStage", () => {
  it("maps aliases", () => {
    expect(normalizeVpdStage("Vegetative")).toBe("veg");
    expect(normalizeVpdStage("Flowering")).toBe("flower");
    expect(normalizeVpdStage("ripening")).toBe("late_flower");
    expect(normalizeVpdStage("flush")).toBe("late_flower");
    expect(normalizeVpdStage("Drying")).toBe("harvest");
    expect(normalizeVpdStage("pre-flower")).toBe("preflower");
  });
  it("handles null/empty/unknown", () => {
    expect(normalizeVpdStage(null)).toBe("unknown");
    expect(normalizeVpdStage("")).toBe("unknown");
    expect(normalizeVpdStage("zzz")).toBe("unknown");
  });
});

describe("classifyVpdAgainstStage — boundaries + deadband", () => {
  it("min boundary is in_target", () => {
    expect(
      classifyVpdAgainstStage({ value: 0.8, stage: "veg" }).classification,
    ).toBe("in_target");
  });
  it("max boundary is in_target", () => {
    expect(
      classifyVpdAgainstStage({ value: 1.2, stage: "veg" }).classification,
    ).toBe("in_target");
  });
  it("deadband keeps values within +/- VPD_DEADBAND_KPA in_target", () => {
    expect(
      classifyVpdAgainstStage({
        value: 0.8 - VPD_DEADBAND_KPA,
        stage: "veg",
      }).classification,
    ).toBe("in_target");
    expect(
      classifyVpdAgainstStage({
        value: 1.2 + VPD_DEADBAND_KPA,
        stage: "veg",
      }).classification,
    ).toBe("in_target");
  });
  it("outside deadband flips below/above deterministically", () => {
    expect(
      classifyVpdAgainstStage({
        value: 0.8 - VPD_DEADBAND_KPA - 0.001,
        stage: "veg",
      }).classification,
    ).toBe("below_target");
    expect(
      classifyVpdAgainstStage({
        value: 1.2 + VPD_DEADBAND_KPA + 0.001,
        stage: "veg",
      }).classification,
    ).toBe("above_target");
  });
  it("seedling lower edge with deadband", () => {
    expect(
      classifyVpdAgainstStage({ value: 0.4, stage: "seedling" }).classification,
    ).toBe("in_target");
    expect(
      classifyVpdAgainstStage({ value: 0.3, stage: "seedling" }).classification,
    ).toBe("below_target");
  });
  it("late_flower upper edge with deadband", () => {
    expect(
      classifyVpdAgainstStage({ value: 1.5, stage: "late_flower" })
        .classification,
    ).toBe("in_target");
    expect(
      classifyVpdAgainstStage({ value: 1.7, stage: "late_flower" })
        .classification,
    ).toBe("above_target");
  });
});

describe("classifyVpdAgainstStage — special states", () => {
  it("null value -> unavailable", () => {
    const r = classifyVpdAgainstStage({ value: null, stage: "veg" });
    expect(r.classification).toBe("unavailable");
    expect(r.value).toBeNull();
  });
  it("NaN / Infinity -> unavailable", () => {
    expect(
      classifyVpdAgainstStage({ value: NaN, stage: "veg" }).classification,
    ).toBe("unavailable");
    expect(
      classifyVpdAgainstStage({ value: Infinity, stage: "veg" }).classification,
    ).toBe("unavailable");
  });
  it("unknown stage -> stage_unknown even with value", () => {
    const r = classifyVpdAgainstStage({ value: 1.0, stage: null });
    expect(r.classification).toBe("stage_unknown");
    expect(r.value).toBe(1.0);
  });
  it("harvest -> context_only (distinct from unavailable)", () => {
    const r = classifyVpdAgainstStage({ value: 1.0, stage: "harvest" });
    expect(r.classification).toBe("context_only");
    expect(r.band.contextOnly).toBe(true);
    expect(r.label.toLowerCase()).toContain("context only");
  });
  it("stale reading marks historical and never reads as healthy/live", () => {
    const r = classifyVpdAgainstStage({
      value: 1.0,
      stage: "veg",
      stale: true,
    });
    expect(r.stale).toBe(true);
    expect(r.historical).toBe(true);
    expect(r.classification).toBe("in_target");
    expect(r.label.toLowerCase()).toMatch(/historical|stale/);
    // MetricChip status must not be "ok" when stale, even if in range.
    expect(vpdMetricChipStatus(r)).not.toBe("ok");
  });
  it("does not clamp raw values", () => {
    const high = classifyVpdAgainstStage({ value: 4.2, stage: "veg" });
    expect(high.value).toBe(4.2);
    expect(high.classification).toBe("above_target");
    const low = classifyVpdAgainstStage({ value: -1, stage: "veg" });
    expect(low.value).toBe(-1);
    expect(low.classification).toBe("below_target");
  });
});

describe("vpdMetricChipStatus", () => {
  it("in_target fresh -> ok", () => {
    const r = classifyVpdAgainstStage({ value: 1.0, stage: "veg" });
    expect(vpdMetricChipStatus(r)).toBe("ok");
  });
  it("below/above -> warn", () => {
    expect(
      vpdMetricChipStatus(
        classifyVpdAgainstStage({ value: 0.1, stage: "veg" }),
      ),
    ).toBe("warn");
    expect(
      vpdMetricChipStatus(
        classifyVpdAgainstStage({ value: 3.0, stage: "veg" }),
      ),
    ).toBe("warn");
  });
  it("context_only / stage_unknown / unavailable -> warn", () => {
    expect(
      vpdMetricChipStatus(
        classifyVpdAgainstStage({ value: 1.0, stage: "harvest" }),
      ),
    ).toBe("warn");
    expect(
      vpdMetricChipStatus(
        classifyVpdAgainstStage({ value: 1.0, stage: null }),
      ),
    ).toBe("warn");
    expect(
      vpdMetricChipStatus(
        classifyVpdAgainstStage({ value: null, stage: "veg" }),
      ),
    ).toBe("warn");
  });
});

describe("determinism + safety contract", () => {
  it("is deterministic across calls", () => {
    const a = classifyVpdAgainstStage({ value: 1.05, stage: "flower" });
    const b = classifyVpdAgainstStage({ value: 1.05, stage: "flower" });
    expect(a).toEqual(b);
  });
  it("exposes the required helper copy string", () => {
    expect(VPD_STAGE_HELPER_TEXT).toBe(
      "VPD targets depend on plant stage. Stale readings are historical and should not be treated as live conditions.",
    );
  });
  it("has no Supabase/fetch/automation/device-control surface", () => {
    expect(HELPER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(HELPER).not.toMatch(/\bfetch\(/);
    expect(HELPER).not.toMatch(/service_role/);
    expect(HELPER).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i,
    );
    expect(HELPER).not.toMatch(/ai[\s_-]?coach|ai_doctor/i);
    expect(HELPER).not.toMatch(/\.from\(["']action_queue["']\)/);
    expect(HELPER).not.toMatch(/\.from\(["']alerts["']\)/);
  });
});

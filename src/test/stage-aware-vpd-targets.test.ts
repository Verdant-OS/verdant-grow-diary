/**
 * Tests for stage-aware VPD target bands (pure helper).
 *
 * Covers every stage, exact boundary behavior, stale handling, unknown stage,
 * harvest/context-only behavior, deterministic output, and safety contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyVpdAgainstStage,
  getVpdTargetBand,
  normalizeVpdStage,
  VPD_STAGE_HELPER_TEXT,
  type VpdStage,
} from "@/lib/stageAwareVpdTargets";

const ROOT = resolve(__dirname, "../..");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/stageAwareVpdTargets.ts"),
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

describe("getVpdTargetBand — per-stage ranges", () => {
  for (const [stage, range] of Object.entries(EXPECTED) as [
    VpdStage,
    { min: number | null; max: number | null },
  ][]) {
    it(`returns conservative range for ${stage}`, () => {
      const band = getVpdTargetBand(stage);
      expect(band.stage).toBe(stage);
      expect(band.min).toBe(range.min);
      expect(band.max).toBe(range.max);
      expect(band.helper).toMatch(/VPD targets depend on plant stage/);
    });
  }

  it("marks harvest as contextOnly with no active target", () => {
    const band = getVpdTargetBand("harvest");
    expect(band.contextOnly).toBe(true);
    expect(band.min).toBeNull();
    expect(band.max).toBeNull();
  });

  it("marks unknown band with stage-unknown helper copy", () => {
    const band = getVpdTargetBand(null);
    expect(band.stage).toBe("unknown");
    expect(band.helper.toLowerCase()).toMatch(/stage unknown/);
  });
});

describe("normalizeVpdStage", () => {
  it("maps common aliases", () => {
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

describe("classifyVpdAgainstStage — boundaries", () => {
  it("min boundary is in_target (inclusive)", () => {
    const r = classifyVpdAgainstStage({ value: 0.8, stage: "veg" });
    expect(r.classification).toBe("in_target");
  });
  it("max boundary is in_target (inclusive)", () => {
    const r = classifyVpdAgainstStage({ value: 1.2, stage: "veg" });
    expect(r.classification).toBe("in_target");
  });
  it("just below min is below_target", () => {
    const r = classifyVpdAgainstStage({ value: 0.79, stage: "veg" });
    expect(r.classification).toBe("below_target");
  });
  it("just above max is above_target", () => {
    const r = classifyVpdAgainstStage({ value: 1.21, stage: "veg" });
    expect(r.classification).toBe("above_target");
  });
  it("seedling 0.4 lower boundary", () => {
    expect(
      classifyVpdAgainstStage({ value: 0.4, stage: "seedling" }).classification,
    ).toBe("in_target");
    expect(
      classifyVpdAgainstStage({ value: 0.39, stage: "seedling" }).classification,
    ).toBe("below_target");
  });
  it("late_flower upper boundary 1.5", () => {
    expect(
      classifyVpdAgainstStage({ value: 1.5, stage: "late_flower" })
        .classification,
    ).toBe("in_target");
    expect(
      classifyVpdAgainstStage({ value: 1.51, stage: "late_flower" })
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
  it("unknown stage -> stage_unknown classification even with a value", () => {
    const r = classifyVpdAgainstStage({ value: 1.0, stage: null });
    expect(r.classification).toBe("stage_unknown");
    expect(r.value).toBe(1.0);
  });
  it("harvest -> unavailable (context only) with band exposed", () => {
    const r = classifyVpdAgainstStage({ value: 1.0, stage: "harvest" });
    expect(r.classification).toBe("unavailable");
    expect(r.band.contextOnly).toBe(true);
    expect(r.label.toLowerCase()).toMatch(/context only/);
  });
  it("stale reading preserves stale flag and marks historical", () => {
    const r = classifyVpdAgainstStage({
      value: 1.0,
      stage: "veg",
      stale: true,
    });
    expect(r.stale).toBe(true);
    expect(r.historical).toBe(true);
    expect(r.classification).toBe("in_target");
    expect(r.label.toLowerCase()).toMatch(/historical|stale/);
  });
  it("does not clamp raw values", () => {
    const r = classifyVpdAgainstStage({ value: 4.2, stage: "veg" });
    expect(r.value).toBe(4.2);
    expect(r.classification).toBe("above_target");
  });
});

describe("determinism + safety contract", () => {
  it("is deterministic across calls", () => {
    const a = classifyVpdAgainstStage({ value: 1.05, stage: "flower" });
    const b = classifyVpdAgainstStage({ value: 1.05, stage: "flower" });
    expect(a).toEqual(b);
  });
  it("helper text references stage-dependence", () => {
    expect(VPD_STAGE_HELPER_TEXT.toLowerCase()).toMatch(/stage/);
  });
  it("has no Supabase/fetch/automation/device-control imports or strings", () => {
    expect(HELPER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(HELPER).not.toMatch(/\bfetch\(/);
    expect(HELPER).not.toMatch(/service_role/);
    expect(HELPER).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i,
    );
    expect(HELPER).not.toMatch(/ai[\s_-]?coach|ai_doctor/i);
    // helper doc comment mentions "no Action Queue creation" — assert there
    // is no actual write/insert into action_queue rather than substring match.
    expect(HELPER).not.toMatch(/\.from\(["']action_queue["']\)/);
  });
});

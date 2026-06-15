/**
 * earlyStageQuickLogRules — pure rule tests.
 *
 * Safety boundary: this module is pure. No Supabase, no Action Queue,
 * no AI, no device control imports. We assert those negatives below.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EARLY_STAGE_MILESTONES,
  EARLY_STAGE_VIGOR_OPTIONS,
  EARLY_STAGE_PHOTO_HINT,
  buildEarlyStageDetails,
  buildEarlyStageNoteSuffix,
  evaluateEarlyStageVisibility,
  isMilestoneValue,
  isVigorValue,
} from "@/lib/earlyStageQuickLogRules";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("evaluateEarlyStageVisibility", () => {
  it("shows when stage is seedling or germination", () => {
    expect(evaluateEarlyStageVisibility({ stage: "seedling", now: NOW })).toBe("visible");
    expect(evaluateEarlyStageVisibility({ stage: "Germination", now: NOW })).toBe("visible");
    expect(evaluateEarlyStageVisibility({ stage: "germ", now: NOW })).toBe("visible");
  });

  it("hides when stage is veg/flower/etc.", () => {
    for (const stage of ["veg", "vegetative", "flower", "flowering", "flush", "harvest", "drying"]) {
      expect(evaluateEarlyStageVisibility({ stage, now: NOW })).toBe("hidden");
    }
  });

  it("suggests when stage unknown but plant is young (within window)", () => {
    const plantCreatedAt = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();
    expect(
      evaluateEarlyStageVisibility({ stage: null, plantCreatedAt, now: NOW }),
    ).toBe("suggested");
  });

  it("hides when stage unknown and plant is old", () => {
    const plantCreatedAt = new Date(NOW.getTime() - 60 * 86_400_000).toISOString();
    expect(
      evaluateEarlyStageVisibility({ stage: null, plantCreatedAt, now: NOW }),
    ).toBe("hidden");
  });

  it("hides when nothing is known", () => {
    expect(evaluateEarlyStageVisibility({ now: NOW })).toBe("hidden");
    expect(
      evaluateEarlyStageVisibility({ plantCreatedAt: "not-a-date", now: NOW }),
    ).toBe("hidden");
  });

  it("never crashes on negative ages or future dates", () => {
    const future = new Date(NOW.getTime() + 10 * 86_400_000).toISOString();
    expect(
      evaluateEarlyStageVisibility({ stage: null, plantCreatedAt: future, now: NOW }),
    ).toBe("hidden");
  });
});

describe("buildEarlyStageDetails", () => {
  it("returns null when nothing was selected", () => {
    expect(buildEarlyStageDetails({})).toBeNull();
    expect(buildEarlyStageDetails({ milestone: null, vigor: null, notes: "  " })).toBeNull();
  });

  it("returns a deterministic envelope with chosen values", () => {
    const env = buildEarlyStageDetails({
      milestone: "cotyledons_open",
      vigor: "strong",
      notes: "  bright green  ",
      stage: "Seedling",
    });
    expect(env).toEqual({
      early_stage_milestone: "cotyledons_open",
      vigor: "strong",
      notes: "bright green",
      stage_context: "seedling",
    });
  });

  it("rejects invalid milestone/vigor values silently", () => {
    const env = buildEarlyStageDetails({
      milestone: "not-a-milestone" as never,
      vigor: "ultra" as never,
      notes: "x",
    });
    expect(env).toEqual({
      early_stage_milestone: null,
      vigor: null,
      notes: "x",
      stage_context: null,
    });
  });
});

describe("buildEarlyStageNoteSuffix", () => {
  it("returns empty when no envelope", () => {
    expect(buildEarlyStageNoteSuffix({})).toBe("");
  });

  it("formats milestone + vigor + notes for the diary note", () => {
    const s = buildEarlyStageNoteSuffix({
      milestone: "taproot_visible",
      vigor: "medium",
      notes: "tiny root tip",
    });
    expect(s).toContain("Milestone: Taproot visible");
    expect(s).toContain("Vigor: Medium");
    expect(s).toContain("Early note: tiny root tip");
  });
});

describe("milestone / vigor option lists", () => {
  it("expose the 5 milestones + 4 vigor options the task requires", () => {
    expect(EARLY_STAGE_MILESTONES.map((m) => m.value)).toEqual([
      "seed_started",
      "taproot_visible",
      "planted_in_medium",
      "cotyledons_open",
      "first_true_leaves",
    ]);
    expect(EARLY_STAGE_VIGOR_OPTIONS.map((v) => v.value)).toEqual([
      "strong",
      "medium",
      "weak",
      "stressed",
    ]);
  });

  it("type-guards recognize valid values only", () => {
    expect(isMilestoneValue("seed_started")).toBe(true);
    expect(isMilestoneValue("foo")).toBe(false);
    expect(isVigorValue("strong")).toBe(true);
    expect(isVigorValue("foo")).toBe(false);
  });

  it("documents that photo is recommended, not required", () => {
    expect(EARLY_STAGE_PHOTO_HINT.toLowerCase()).toContain("recommended");
    expect(EARLY_STAGE_PHOTO_HINT.toLowerCase()).toContain("not required");
  });
});

describe("safety boundary — pure module", () => {
  const source = readFileSync(
    resolve(__dirname, "../lib/earlyStageQuickLogRules.ts"),
    "utf8",
  );
  it("imports no Supabase, Action Queue, AI, or device-control surfaces", () => {
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/action_queue/);
    expect(source).not.toMatch(/edge-function/i);
    expect(source).not.toMatch(/openai|anthropic|ai-gateway|lovable-ai/i);
    expect(source).not.toMatch(/device[_-]?control|home[_-]?assistant|mqtt/i);
    expect(source).not.toMatch(/automation|cron|trigger/i);
  });
});

/**
 * Tests for the Relative Cultivation Timeline foundation.
 *
 * Covers stage presets, pure relative-day helpers, deterministic sort, and
 * the approval-required stage shift recommendation draft contract.
 */
import { describe, it, expect } from "vitest";
import {
  buildStageShiftRecommendationDraft,
  calculatePlantRelativeDay,
  calculateStageRelativeDay,
  getRelativeStagePreset,
  listRelativeStagePresets,
  sortStageTimelineItems,
} from "@/lib/relativeStageTimelineRules";

describe("relativeStageTimelineRules — presets", () => {
  it("includes Seedling, Clone, Vegetation, Flower, Dry, Cure", () => {
    const keys = listRelativeStagePresets().map((p) => p.key);
    expect(keys).toEqual([
      "seedling",
      "clone",
      "vegetation",
      "flower",
      "dry",
      "cure",
    ]);
  });

  it("preset order is deterministic across calls", () => {
    const a = listRelativeStagePresets().map((p) => p.key);
    const b = listRelativeStagePresets().map((p) => p.key);
    expect(a).toEqual(b);
  });

  it("preset color tokens and directions are stable", () => {
    expect(getRelativeStagePreset("seedling")?.colorToken).toBe("stage-seedling");
    expect(getRelativeStagePreset("seedling")?.colorDirection).toBe(
      "Soft Mint Green",
    );
    expect(getRelativeStagePreset("clone")?.colorDirection).toBe(
      "Vibrant Teal",
    );
    expect(getRelativeStagePreset("vegetation")?.colorDirection).toBe(
      "Lush Emerald Green",
    );
    expect(getRelativeStagePreset("flower")?.colorDirection).toBe(
      "Deep Ultraviolet / Magenta",
    );
    expect(getRelativeStagePreset("dry")?.colorDirection).toBe("Amber / Gold");
    expect(getRelativeStagePreset("cure")?.colorDirection).toBe(
      "Rich Earthy Brown",
    );
  });

  it("getRelativeStagePreset returns null for unknown/invalid keys", () => {
    expect(getRelativeStagePreset(null)).toBeNull();
    expect(getRelativeStagePreset(undefined)).toBeNull();
    expect(getRelativeStagePreset("")).toBeNull();
    expect(getRelativeStagePreset("unknown")).toBeNull();
  });

  it("getRelativeStagePreset is case-insensitive", () => {
    expect(getRelativeStagePreset("FLOWER")?.key).toBe("flower");
    expect(getRelativeStagePreset("  Vegetation  ")?.key).toBe("vegetation");
  });
});

describe("relativeStageTimelineRules — relative day calculations", () => {
  it("plant-relative day is deterministic", () => {
    const start = "2026-05-01T00:00:00.000Z";
    const event = "2026-05-08T12:00:00.000Z";
    expect(
      calculatePlantRelativeDay({ plantStartedAt: start, eventAt: event }),
    ).toBe(7);
  });

  it("stage-relative day is deterministic", () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const event = new Date("2026-05-15T00:00:00.000Z");
    expect(
      calculateStageRelativeDay({ stageStartedAt: start, eventAt: event }),
    ).toBe(14);
  });

  it("invalid/missing dates return null", () => {
    expect(
      calculatePlantRelativeDay({ plantStartedAt: null, eventAt: "x" }),
    ).toBeNull();
    expect(
      calculatePlantRelativeDay({
        plantStartedAt: "not-a-date",
        eventAt: "2026-01-01",
      }),
    ).toBeNull();
    expect(
      calculateStageRelativeDay({ stageStartedAt: undefined, eventAt: null }),
    ).toBeNull();
  });

  it("event before anchor returns null (no negative days)", () => {
    expect(
      calculatePlantRelativeDay({
        plantStartedAt: "2026-05-10T00:00:00.000Z",
        eventAt: "2026-05-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("relativeStageTimelineRules — sorting", () => {
  it("sorts newest-first with stable id tie-break", () => {
    const items = [
      { id: "b", eventAt: "2026-05-02T00:00:00Z" },
      { id: "a", eventAt: "2026-05-02T00:00:00Z" },
      { id: "c", eventAt: "2026-05-03T00:00:00Z" },
      { id: "d", eventAt: "not-a-date" },
    ];
    const sorted = sortStageTimelineItems(items);
    expect(sorted.map((i) => i.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("handles empty/invalid input safely", () => {
    expect(sortStageTimelineItems([])).toEqual([]);
    expect(sortStageTimelineItems(null as never)).toEqual([]);
  });
});

describe("relativeStageTimelineRules — stage shift recommendation draft", () => {
  const baseInput = {
    plantId: "plant-1",
    currentStage: "vegetation",
    suggestedStage: "flower" as const,
    trigger: "early_preflower_observed" as const,
    observedAt: "2026-05-20T00:00:00.000Z",
    evidence: ["photo: pistils visible"],
  };

  it("returns null for invalid input", () => {
    expect(buildStageShiftRecommendationDraft(null as never)).toBeNull();
    expect(
      buildStageShiftRecommendationDraft({ ...baseInput, plantId: "" }),
    ).toBeNull();
    expect(
      buildStageShiftRecommendationDraft({
        ...baseInput,
        // @ts-expect-error
        suggestedStage: "bogus",
      }),
    ).toBeNull();
  });

  it("is always approval-required", () => {
    const draft = buildStageShiftRecommendationDraft(baseInput)!;
    expect(draft.requiresApproval).toBe(true);
  });

  it("never auto-applies / never mutates plant.stage directly", () => {
    const draft = buildStageShiftRecommendationDraft(baseInput)!;
    expect(draft.mutatesStageDirectly).toBe(false);
  });

  it("never includes device commands", () => {
    const draft = buildStageShiftRecommendationDraft(baseInput)!;
    expect(Array.isArray(draft.deviceCommands)).toBe(true);
    expect(draft.deviceCommands.length).toBe(0);
  });

  it("never implies feed or environment changes", () => {
    const draft = buildStageShiftRecommendationDraft(baseInput)!;
    expect(draft.suggestsFeedingChange).toBe(false);
    expect(draft.suggestsEnvironmentChange).toBe(false);
  });

  it("uses cautious 'Review whether...' copy", () => {
    const draft = buildStageShiftRecommendationDraft(baseInput)!;
    expect(draft.message).toMatch(/^Review whether this plant should move into /);
    expect(draft.message).toContain("Flower");
  });

  it("normalizes observedAt and preserves evidence", () => {
    const draft = buildStageShiftRecommendationDraft(baseInput)!;
    expect(draft.observedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(draft.evidence).toEqual(["photo: pistils visible"]);
  });
});

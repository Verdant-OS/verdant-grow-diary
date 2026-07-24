/**
 * plantTypeRules — every branch and reason code of the pure type &
 * comparability helpers (Step 1 of the autoflower/photoperiod plan,
 * locked 2026-07-21).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  areComparable,
  isAutoflower,
  normalizePlantType,
  plantStageRank,
  plantTypeBadgeLabel,
  PLANT_STAGE_COMPARABILITY_TOLERANCE,
  PLANT_TYPE_VALUES,
} from "@/lib/plantTypeRules";

describe("normalizePlantType", () => {
  it("null, undefined, empty, and whitespace are unknown", () => {
    expect(normalizePlantType(null)).toBe("unknown");
    expect(normalizePlantType(undefined)).toBe("unknown");
    expect(normalizePlantType("")).toBe("unknown");
    expect(normalizePlantType("   ")).toBe("unknown");
  });

  it("canonical and synonym values normalize with trim + case folding", () => {
    expect(normalizePlantType("autoflower")).toBe("autoflower");
    expect(normalizePlantType("  AutoFlowering ")).toBe("autoflower");
    expect(normalizePlantType("AUTO")).toBe("autoflower");
    expect(normalizePlantType("photoperiod")).toBe("photoperiod");
    expect(normalizePlantType(" Photo ")).toBe("photoperiod");
    expect(normalizePlantType("photoperiodic")).toBe("photoperiod");
  });

  it("unrecognized values are unknown — never a silent photoperiod default", () => {
    expect(normalizePlantType("automatic watering")).toBe("unknown");
    expect(normalizePlantType("fem")).toBe("unknown");
    expect(normalizePlantType("regular")).toBe("unknown");
    expect(normalizePlantType("not sure")).toBe("unknown");
  });

  it("the canonical stored vocabulary is exactly the three PlantType values", () => {
    expect(PLANT_TYPE_VALUES).toEqual(["autoflower", "photoperiod", "unknown"]);
  });
});

describe("isAutoflower", () => {
  it("true only for declared autoflower", () => {
    expect(isAutoflower("autoflower")).toBe(true);
    expect(isAutoflower(" AUTO ")).toBe(true);
  });

  it("false for photoperiod, unknown, null, undefined, junk", () => {
    expect(isAutoflower("photoperiod")).toBe(false);
    expect(isAutoflower("unknown")).toBe(false);
    expect(isAutoflower(null)).toBe(false);
    expect(isAutoflower(undefined)).toBe(false);
    expect(isAutoflower("gelato auto runtz")).toBe(false);
  });
});

describe("plantStageRank", () => {
  it("ranks the plants-table stage vocabulary in order", () => {
    const ranks = ["seedling", "veg", "flower", "flush", "harvest", "cure"].map(plantStageRank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
    // Strictly ascending — the vocabulary is an ordered lifecycle.
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]!).toBeGreaterThan(ranks[i - 1]!);
  });

  it("ranks the grow-vocabulary alias drying with cure", () => {
    expect(plantStageRank("drying")).toBe(plantStageRank("cure"));
  });

  it("is trim/case tolerant and null for unknown or missing stages", () => {
    expect(plantStageRank(" Veg ")).toBe(2);
    expect(plantStageRank("vegetation")).toBeNull();
    expect(plantStageRank("")).toBeNull();
    expect(plantStageRank(null)).toBeNull();
    expect(plantStageRank(undefined)).toBeNull();
  });
});

describe("areComparable", () => {
  const auto = (stageRank?: number | null) => ({ plantType: "autoflower", stageRank });
  const photo = (stageRank?: number | null) => ({ plantType: "photoperiod", stageRank });

  it("unknown on either side (or both) is type_unknown", () => {
    expect(areComparable({ plantType: "unknown" }, photo())).toEqual({
      comparable: false,
      reason: "type_unknown",
    });
    expect(areComparable(auto(), { plantType: null })).toEqual({
      comparable: false,
      reason: "type_unknown",
    });
    expect(areComparable({}, {})).toEqual({ comparable: false, reason: "type_unknown" });
    expect(areComparable(null, undefined)).toEqual({ comparable: false, reason: "type_unknown" });
  });

  it("type_unknown takes precedence over any stage distance", () => {
    expect(areComparable({ plantType: "", stageRank: 1 }, photo(6))).toEqual({
      comparable: false,
      reason: "type_unknown",
    });
  });

  it("declared autoflower vs declared photoperiod is type_mismatch (both directions)", () => {
    expect(areComparable(auto(), photo())).toEqual({ comparable: false, reason: "type_mismatch" });
    expect(areComparable(photo(), auto())).toEqual({ comparable: false, reason: "type_mismatch" });
  });

  it("same type within the locked stage tolerance is comparable", () => {
    expect(PLANT_STAGE_COMPARABILITY_TOLERANCE).toBe(1);
    expect(areComparable(auto(2), auto(2))).toEqual({ comparable: true });
    expect(areComparable(photo(2), photo(3))).toEqual({ comparable: true });
  });

  it("same type beyond the locked stage tolerance is stage_mismatch", () => {
    expect(areComparable(auto(1), auto(3))).toEqual({
      comparable: false,
      reason: "stage_mismatch",
    });
    expect(areComparable(photo(6), photo(1))).toEqual({
      comparable: false,
      reason: "stage_mismatch",
    });
  });

  it("missing or non-finite stage ranks skip the stage check (null-safe)", () => {
    expect(areComparable(auto(null), auto(6))).toEqual({ comparable: true });
    expect(areComparable(photo(), photo(1))).toEqual({ comparable: true });
    expect(areComparable(auto(Number.NaN), auto(1))).toEqual({ comparable: true });
  });
});

describe("plantTypeBadgeLabel", () => {
  it("maps the three types to their persistent badge labels", () => {
    expect(plantTypeBadgeLabel("autoflower")).toBe("Auto");
    expect(plantTypeBadgeLabel("photoperiod")).toBe("Photo");
    expect(plantTypeBadgeLabel("unknown")).toBe("Type unknown");
    expect(plantTypeBadgeLabel(null)).toBe("Type unknown");
  });
});

describe("module purity", () => {
  it("stays free of React, Supabase, timers, and I/O", () => {
    const src = readFileSync(resolve(__dirname, "..", "lib", "plantTypeRules.ts"), "utf8");
    expect(src).not.toMatch(/from ["']react/);
    expect(src).not.toMatch(/@\/integrations\/supabase|supabase-js/);
    expect(src).not.toMatch(/setTimeout|setInterval|Date\.now|fetch\(/);
  });
});

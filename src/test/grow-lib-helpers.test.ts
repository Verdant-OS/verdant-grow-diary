/**
 * Unit tests for src/lib/grow.ts
 *
 * Pure function tests: stageLabel and growTypeLabel.
 * No I/O, no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import { stageLabel, growTypeLabel, STAGES, GROW_TYPES } from "@/lib/grow";

describe("stageLabel", () => {
  it("returns the human-readable label for every known stage value", () => {
    for (const { value, label } of STAGES) {
      expect(stageLabel(value)).toBe(label);
    }
  });

  it("covers all expected stage values explicitly", () => {
    expect(stageLabel("seedling")).toBe("Seedling");
    expect(stageLabel("veg")).toBe("Vegetative");
    expect(stageLabel("flower")).toBe("Flowering");
    expect(stageLabel("flush")).toBe("Flushing");
    expect(stageLabel("harvest")).toBe("Harvest");
    expect(stageLabel("drying")).toBe("Drying / Curing");
  });

  it("returns the raw value for an unknown stage string", () => {
    expect(stageLabel("unknown_stage")).toBe("unknown_stage");
    expect(stageLabel("clone")).toBe("clone");
  });

  it("returns '—' for null", () => {
    expect(stageLabel(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(stageLabel(undefined)).toBe("—");
  });

  it("returns the empty string itself for empty string input", () => {
    // `?? value ?? "—"` — the nullish-coalesce chain only fires for null/undefined.
    // An empty-string value passes through as the middle fallback.
    expect(stageLabel("")).toBe("");
  });
});

describe("growTypeLabel", () => {
  it("returns the human-readable label for every known grow type value", () => {
    for (const { value, label } of GROW_TYPES) {
      expect(growTypeLabel(value)).toBe(label);
    }
  });

  it("covers all expected grow type values explicitly", () => {
    expect(growTypeLabel("tent")).toBe("Indoor Tent");
    expect(growTypeLabel("outdoor")).toBe("Outdoor");
    expect(growTypeLabel("clones")).toBe("Clones");
    expect(growTypeLabel("mothers")).toBe("Mothers");
    expect(growTypeLabel("greenhouse")).toBe("Greenhouse");
    expect(growTypeLabel("other")).toBe("Other");
  });

  it("returns the raw value for an unknown grow type string", () => {
    expect(growTypeLabel("hydro")).toBe("hydro");
    expect(growTypeLabel("aquaponics")).toBe("aquaponics");
  });

  it("returns '—' for null", () => {
    expect(growTypeLabel(null)).toBe("—");
  });

  it("returns '—' for undefined", () => {
    expect(growTypeLabel(undefined)).toBe("—");
  });

  it("returns the empty string itself for empty string input", () => {
    // `?? value ?? "—"` — the nullish-coalesce chain only fires for null/undefined.
    // An empty-string value passes through as the middle fallback.
    expect(growTypeLabel("")).toBe("");
  });
});

describe("STAGES constant", () => {
  it("has exactly 6 stages", () => {
    expect(STAGES).toHaveLength(6);
  });

  it("all stage values are unique", () => {
    const values = STAGES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("all stage labels are non-empty strings", () => {
    for (const { label } of STAGES) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("GROW_TYPES constant", () => {
  it("has exactly 6 grow types", () => {
    expect(GROW_TYPES).toHaveLength(6);
  });

  it("all grow type values are unique", () => {
    const values = GROW_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("all grow type labels are non-empty strings", () => {
    for (const { label } of GROW_TYPES) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

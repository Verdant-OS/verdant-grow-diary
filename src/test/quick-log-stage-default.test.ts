/**
 * Slice A2 — Quick Log stage defaulting.
 *
 * Locks the fix for the legacy bug where stage initialized as
 * `activeGrow?.stage || "veg"`: it ignored the selected plant and collapsed
 * unknown context to Vegetative.
 *
 * Contract proven here (pure — no React, no Supabase):
 *   - a flowering plant defaults to Flower, a veg plant to Vegetative
 *   - unknown plant stage does NOT become Vegetative
 *   - the active grow stage is a fallback, used ONLY when plant stage is absent
 *   - malformed / unexpected values normalize safely to unknown
 *   - the resolved value is always a canonical STAGES value or "" — which is
 *     exactly the single string the UI Select, the preview, and the saved
 *     payload all read (the "same stage shown = stage saved" invariant)
 */
import { describe, it, expect } from "vitest";
import {
  resolveQuickLogStageDefault,
  normalizeQuickLogStage,
  isKnownQuickLogStage,
  UNKNOWN_STAGE,
} from "@/lib/quickLogStageDefaultRules";
import { STAGES } from "@/lib/grow";

describe("resolveQuickLogStageDefault", () => {
  it("a flowering plant opens Quick Log defaulted to Flower", () => {
    expect(resolveQuickLogStageDefault({ plantStage: "flower", growStage: "veg" })).toBe("flower");
  });

  it("a veg plant opens Quick Log defaulted to Vegetative", () => {
    expect(resolveQuickLogStageDefault({ plantStage: "veg", growStage: "flower" })).toBe("veg");
  });

  it("plant stage wins over grow stage when both are present", () => {
    // The whole point of the fix: the selected plant, not the grow, decides.
    expect(resolveQuickLogStageDefault({ plantStage: "flower", growStage: "veg" })).toBe("flower");
    expect(resolveQuickLogStageDefault({ plantStage: "seedling", growStage: "harvest" })).toBe(
      "seedling",
    );
  });

  it("uses the active grow stage ONLY when plant stage is unavailable", () => {
    expect(resolveQuickLogStageDefault({ plantStage: null, growStage: "flower" })).toBe("flower");
    expect(resolveQuickLogStageDefault({ plantStage: undefined, growStage: "flush" })).toBe(
      "flush",
    );
    expect(resolveQuickLogStageDefault({ plantStage: "", growStage: "drying" })).toBe("drying");
  });

  it("unknown context stays UNKNOWN — it does NOT default to Vegetative", () => {
    expect(resolveQuickLogStageDefault({ plantStage: null, growStage: null })).toBe(UNKNOWN_STAGE);
    expect(resolveQuickLogStageDefault({})).toBe(UNKNOWN_STAGE);
    // The historical bug: neither plant nor grow known → "veg". Never again.
    expect(resolveQuickLogStageDefault({ plantStage: null, growStage: null })).not.toBe("veg");
    expect(UNKNOWN_STAGE).toBe("");
  });

  it("malformed / unrecognized stages normalize safely (fall through to fallback)", () => {
    // An unknown plant stage falls back to a valid grow stage...
    expect(resolveQuickLogStageDefault({ plantStage: "banana", growStage: "flower" })).toBe(
      "flower",
    );
    // ...and if the grow stage is also junk, the result is UNKNOWN, not "veg".
    expect(resolveQuickLogStageDefault({ plantStage: "banana", growStage: "42" })).toBe(
      UNKNOWN_STAGE,
    );
    expect(resolveQuickLogStageDefault({ plantStage: 123, growStage: { s: "veg" } })).toBe(
      UNKNOWN_STAGE,
    );
  });
});

describe("normalizeQuickLogStage", () => {
  it("accepts every canonical STAGES value unchanged", () => {
    for (const s of STAGES) {
      expect(normalizeQuickLogStage(s.value)).toBe(s.value);
    }
  });

  it("accepts human labels case-insensitively and returns the canonical value", () => {
    expect(normalizeQuickLogStage("Flowering")).toBe("flower");
    expect(normalizeQuickLogStage("  vegetative  ")).toBe("veg");
    expect(normalizeQuickLogStage("Drying / Curing")).toBe("drying");
    expect(normalizeQuickLogStage("SEEDLING")).toBe("seedling");
  });

  it("returns null for empty, whitespace, unknown text, and non-strings", () => {
    expect(normalizeQuickLogStage("")).toBeNull();
    expect(normalizeQuickLogStage("   ")).toBeNull();
    expect(normalizeQuickLogStage("bloom")).toBeNull();
    expect(normalizeQuickLogStage(null)).toBeNull();
    expect(normalizeQuickLogStage(undefined)).toBeNull();
    expect(normalizeQuickLogStage(7)).toBeNull();
    expect(normalizeQuickLogStage({})).toBeNull();
  });

  it("never invents a stage label outside the canonical set", () => {
    const canonical = new Set<string>(STAGES.map((s) => s.value));
    for (const probe of ["flower", "Flowering", "veg", "junk", "", null, 5]) {
      const out = normalizeQuickLogStage(probe);
      expect(out === null || canonical.has(out)).toBe(true);
    }
  });
});

describe("isKnownQuickLogStage", () => {
  it("mirrors normalize: true for recognized stages, false otherwise", () => {
    expect(isKnownQuickLogStage("flower")).toBe(true);
    expect(isKnownQuickLogStage("Flowering")).toBe(true);
    expect(isKnownQuickLogStage("")).toBe(false);
    expect(isKnownQuickLogStage("banana")).toBe(false);
    expect(isKnownQuickLogStage(null)).toBe(false);
  });
});

describe("UI-shown stage === saved/preview stage (single-source invariant)", () => {
  // QuickLog holds ONE `stage` string that feeds the Select value, the
  // preview evaluation, and the saved payload. Resolving the default cannot
  // produce a value the Select can't display or a non-canonical stage, so the
  // value the grower sees is exactly the value that is previewed and saved.
  const selectableValues = new Set<string>(STAGES.map((s) => s.value));

  it("every resolved non-empty default is a value the Select can render", () => {
    const cases: Array<{ plantStage?: unknown; growStage?: unknown }> = [
      { plantStage: "flower" },
      { plantStage: "Vegetative" },
      { plantStage: null, growStage: "flush" },
      { plantStage: "banana", growStage: "harvest" },
    ];
    for (const c of cases) {
      const resolved = resolveQuickLogStageDefault(c);
      // Either an empty (unknown) placeholder, or a real Select option value.
      expect(resolved === "" || selectableValues.has(resolved)).toBe(true);
    }
  });

  it("a Flower plant yields the Flower option value the UI and payload share", () => {
    const resolved = resolveQuickLogStageDefault({ plantStage: "flower" });
    expect(resolved).toBe("flower");
    expect(STAGES.find((s) => s.value === resolved)?.label).toBe("Flowering");
  });
});

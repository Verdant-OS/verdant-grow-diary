/**
 * Slice A3 — harvestWeightUnitNormalization tests.
 *
 * Pure helper. Verifies canonical grams conversion, original value/unit
 * preservation, invalid-input safety, and presenter formatting.
 */
import { describe, expect, it } from "vitest";
import {
  GRAMS_PER_UNIT,
  formatGramsForDisplay,
  harvestWeightAsGrams,
  normalizeHarvestWeightToGrams,
} from "@/lib/harvestWeightUnitNormalization";

describe("normalizeHarvestWeightToGrams — canonical conversions", () => {
  it("g → grams (identity)", () => {
    const r = normalizeHarvestWeightToGrams({ value: "120", unit: "g" });
    expect(r).toEqual({ originalValue: "120", originalUnit: "g", grams: 120 });
  });

  it("oz → grams (28.349523125)", () => {
    const r = normalizeHarvestWeightToGrams({ value: "2", unit: "oz" });
    expect(r?.originalUnit).toBe("oz");
    expect(r?.originalValue).toBe("2");
    expect(r?.grams).toBeCloseTo(56.69904625, 8);
  });

  it("lb → grams (453.59237)", () => {
    const r = normalizeHarvestWeightToGrams({ value: "1", unit: "lb" });
    expect(r?.grams).toBeCloseTo(453.59237, 8);
  });

  it("kg → grams (1000)", () => {
    const r = normalizeHarvestWeightToGrams({ value: "1.25", unit: "kg" });
    expect(r?.grams).toBeCloseTo(1250, 8);
  });

  it("preserves the ORIGINAL grower-entered value + unit for display", () => {
    const r = normalizeHarvestWeightToGrams({ value: "12.50", unit: "oz" });
    // exact string is preserved — presenter can show "12.50 oz" verbatim.
    expect(r?.originalValue).toBe("12.50");
    expect(r?.originalUnit).toBe("oz");
  });

  it("accepts numeric input (from typed number fields)", () => {
    const r = normalizeHarvestWeightToGrams({ value: 500, unit: "g" });
    expect(r?.grams).toBe(500);
  });
});

describe("normalizeHarvestWeightToGrams — safety", () => {
  it("rejects empty / null / undefined value", () => {
    expect(normalizeHarvestWeightToGrams({ value: "", unit: "g" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: null, unit: "g" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: undefined, unit: "g" })).toBeNull();
  });

  it("rejects whitespace-only value", () => {
    expect(normalizeHarvestWeightToGrams({ value: "   ", unit: "g" })).toBeNull();
  });

  it("rejects negative and non-numeric text", () => {
    expect(normalizeHarvestWeightToGrams({ value: "-5", unit: "g" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "abc", unit: "g" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "1.2.3", unit: "g" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "1e3", unit: "g" })).toBeNull();
  });

  it("rejects non-finite numeric input", () => {
    expect(normalizeHarvestWeightToGrams({ value: NaN, unit: "g" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: Infinity, unit: "g" })).toBeNull();
  });

  it("rejects unknown / missing units — never invents one", () => {
    expect(normalizeHarvestWeightToGrams({ value: "10", unit: null })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "10", unit: "" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "10", unit: "grams" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "10", unit: "GRAM" })).toBeNull();
    expect(normalizeHarvestWeightToGrams({ value: "10", unit: "pounds" })).toBeNull();
  });

  it("accepts 0 as a valid entry (grower may still be weighing in)", () => {
    const r = normalizeHarvestWeightToGrams({ value: "0", unit: "g" });
    expect(r?.grams).toBe(0);
  });

  it("recomputes on unit change — same value, different unit → different grams", () => {
    const oz = normalizeHarvestWeightToGrams({ value: "2", unit: "oz" });
    const lb = normalizeHarvestWeightToGrams({ value: "2", unit: "lb" });
    expect(oz?.grams).not.toBe(lb?.grams);
    expect(lb!.grams).toBeGreaterThan(oz!.grams);
  });

  it("recomputes on value change — same unit, different value → proportional grams", () => {
    const a = normalizeHarvestWeightToGrams({ value: "1", unit: "kg" });
    const b = normalizeHarvestWeightToGrams({ value: "2", unit: "kg" });
    expect(b!.grams).toBeCloseTo(a!.grams * 2, 8);
  });
});

describe("harvestWeightAsGrams", () => {
  it("returns grams only", () => {
    expect(harvestWeightAsGrams({ value: "1", unit: "kg" })).toBe(1000);
  });
  it("returns null on invalid input", () => {
    expect(harvestWeightAsGrams({ value: "abc", unit: "g" })).toBeNull();
    expect(harvestWeightAsGrams({ value: "10", unit: "grams" })).toBeNull();
  });
});

describe("formatGramsForDisplay", () => {
  it("strips trailing zeros", () => {
    expect(formatGramsForDisplay(1000)).toBe("1000");
    expect(formatGramsForDisplay(1000.1)).toBe("1000.1");
    expect(formatGramsForDisplay(1000.10)).toBe("1000.1");
  });
  it("rounds to 2 decimals", () => {
    expect(formatGramsForDisplay(56.69904625)).toBe("56.7");
    expect(formatGramsForDisplay(56.699)).toBe("56.7");
  });
  it("returns null for invalid", () => {
    expect(formatGramsForDisplay(null)).toBeNull();
    expect(formatGramsForDisplay(undefined)).toBeNull();
    expect(formatGramsForDisplay(NaN)).toBeNull();
    expect(formatGramsForDisplay(-1)).toBeNull();
  });
});

describe("GRAMS_PER_UNIT — locked conversion factors", () => {
  it("matches SI / imperial-avoirdupois definitions exactly", () => {
    expect(GRAMS_PER_UNIT.g).toBe(1);
    expect(GRAMS_PER_UNIT.oz).toBe(28.349523125);
    expect(GRAMS_PER_UNIT.lb).toBe(453.59237);
    expect(GRAMS_PER_UNIT.kg).toBe(1000);
  });
});

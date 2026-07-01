/**
 * harvestDetailsRules — unit tests for the pure Harvest detail helpers.
 * Guarantees empty/invalid/negative inputs are dropped and no yield or
 * readiness claim ever leaks through.
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeHarvestWeightInput,
  sanitizeHarvestWeightUnit,
  buildHarvestDetailsPayload,
  readPersistedHarvestDetails,
  formatHarvestWeightForDisplay,
  validateHarvestWeightInput,
  formatHarvestSavedBreakdownDetail,
  HARVEST_WEIGHT_NEGATIVE_ERROR,
} from "@/lib/harvestDetailsRules";

describe("sanitizeHarvestWeightInput", () => {
  it("returns null for empty/whitespace/null/undefined", () => {
    expect(sanitizeHarvestWeightInput(null)).toBeNull();
    expect(sanitizeHarvestWeightInput(undefined)).toBeNull();
    expect(sanitizeHarvestWeightInput("")).toBeNull();
    expect(sanitizeHarvestWeightInput("   ")).toBeNull();
  });
  it("rejects negative and non-numeric values", () => {
    expect(sanitizeHarvestWeightInput("-5")).toBeNull();
    expect(sanitizeHarvestWeightInput("-0.1")).toBeNull();
    expect(sanitizeHarvestWeightInput("abc")).toBeNull();
    expect(sanitizeHarvestWeightInput("12g")).toBeNull();
    expect(sanitizeHarvestWeightInput("1e3")).toBeNull();
  });
  it("preserves valid non-negative decimals as strings", () => {
    expect(sanitizeHarvestWeightInput("0")).toBe("0");
    expect(sanitizeHarvestWeightInput("12")).toBe("12");
    expect(sanitizeHarvestWeightInput("12.50")).toBe("12.50");
  });
});

describe("sanitizeHarvestWeightUnit", () => {
  it("accepts the four known units", () => {
    expect(sanitizeHarvestWeightUnit("g")).toBe("g");
    expect(sanitizeHarvestWeightUnit("oz")).toBe("oz");
    expect(sanitizeHarvestWeightUnit("lb")).toBe("lb");
    expect(sanitizeHarvestWeightUnit("kg")).toBe("kg");
  });
  it("drops unknown / empty units", () => {
    expect(sanitizeHarvestWeightUnit(null)).toBeNull();
    expect(sanitizeHarvestWeightUnit("")).toBeNull();
    expect(sanitizeHarvestWeightUnit("tonne")).toBeNull();
  });
});

describe("buildHarvestDetailsPayload", () => {
  it("returns null when all inputs are empty or invalid", () => {
    expect(buildHarvestDetailsPayload(null)).toBeNull();
    expect(
      buildHarvestDetailsPayload({ wetWeight: "", dryWeight: "" }),
    ).toBeNull();
    expect(
      buildHarvestDetailsPayload({ wetWeight: "-1", dryWeight: "abc" }),
    ).toBeNull();
  });
  it("omits weightUnit when no weight is entered", () => {
    expect(
      buildHarvestDetailsPayload({ weightUnit: "g" }),
    ).toBeNull();
  });
  it("preserves entered wet weight and unit", () => {
    expect(
      buildHarvestDetailsPayload({
        wetWeight: "120",
        weightUnit: "g",
      }),
    ).toEqual({ wetWeight: "120", weightUnit: "g" });
  });
  it("preserves both weights and unit", () => {
    expect(
      buildHarvestDetailsPayload({
        wetWeight: "120",
        dryWeight: "22",
        weightUnit: "g",
      }),
    ).toEqual({ wetWeight: "120", dryWeight: "22", weightUnit: "g" });
  });
});

describe("readPersistedHarvestDetails", () => {
  it("returns null for non-objects", () => {
    expect(readPersistedHarvestDetails(null)).toBeNull();
    expect(readPersistedHarvestDetails("harvest")).toBeNull();
    expect(readPersistedHarvestDetails([1, 2])).toBeNull();
  });
  it("drops unsafe fields", () => {
    expect(
      readPersistedHarvestDetails({
        wetWeight: "120",
        weightUnit: "g",
        // private id must not leak through the reader
        plantId: "priv-uuid",
      }),
    ).toEqual({ wetWeight: "120", weightUnit: "g" });
  });
});

describe("formatHarvestWeightForDisplay", () => {
  it("returns null when value is missing", () => {
    expect(formatHarvestWeightForDisplay(null, "g")).toBeNull();
    expect(formatHarvestWeightForDisplay("", "g")).toBeNull();
  });
  it("returns unit-less value when unit missing", () => {
    expect(formatHarvestWeightForDisplay("12", null)).toBe("12");
  });
  it("formats value with unit", () => {
    expect(formatHarvestWeightForDisplay("120", "g")).toBe("120 g");
  });
  it("never contains yield/readiness copy", () => {
    const out = formatHarvestWeightForDisplay("120", "g") ?? "";
    expect(out.toLowerCase()).not.toMatch(/yield|ready|potency|quality/);
  });
});

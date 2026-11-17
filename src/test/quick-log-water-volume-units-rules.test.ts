/**
 * Spec docs/specs/quick-log-water-volume-units.md §6, tests 1–7 and the storage
 * half of test 14. Typed ml / L / gal text converts once to canonical ml, and
 * the existing ml gates decide what is valid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";
import {
  maxInWaterEntryUnit,
  mlToWaterEntryDisplay,
  savesAsMlAmount,
  waterEntryDisplayText,
  waterEntryToCanonicalMlText,
  WATER_ENTRY_UNITS,
} from "@/lib/quickLogWaterVolumeUnitRules";
import {
  assessLargeWaterAmount,
  assessWaterVolumeText,
  MAX_WATER_VOLUME_TEXT_LENGTH,
} from "@/lib/quickLogWaterVolumeWarningRules";
import {
  loadWaterVolumeEntryUnit,
  saveWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";

const canonical = waterEntryToCanonicalMlText;

describe("waterEntryToCanonicalMlText", () => {
  it("1: passes ml text through unchanged", () => {
    expect(canonical("250", "ml")).toBe("250");
    expect(canonical("12.5", "ml")).toBe("12.5");
    expect(canonical(" 40 ", "ml")).toBe(" 40 ");
  });

  it("2: converts litres exactly, rounding once half away from zero", () => {
    expect(canonical("1", "L")).toBe("1000");
    expect(canonical("0.75", "L")).toBe("750");
    expect(canonical("1.2345", "L")).toBe("1235");
    expect(canonical("1.2344", "L")).toBe("1234");
  });

  it("3: converts US gallons exactly", () => {
    expect(canonical("1", "gal")).toBe("3785");
    expect(canonical("0.5", "gal")).toBe("1893");
    expect(canonical("2", "gal")).toBe("7571");
    expect(canonical("0.6", "gal")).toBe("2271");
    expect(canonical("0.25", "gal")).toBe("946");
  });

  it("4: the existing ml gates apply to the converted value", () => {
    expect(assessWaterVolumeText(canonical("13.2", "gal"))).toEqual({
      status: "valid",
      volumeMl: 49967,
    });
    expect(assessWaterVolumeText(canonical("13.21", "gal")).status).toBe("too_large");
    expect(assessWaterVolumeText(canonical("50", "L"))).toEqual({
      status: "valid",
      volumeMl: 50000,
    });
    expect(assessWaterVolumeText(canonical("50.001", "L")).status).toBe("too_large");
    const warn = (text: string) =>
      assessLargeWaterAmount({ amount: canonical(text, "gal"), unit: "ml", confirmedKey: null })
        .warns;
    expect(canonical("2.64", "gal")).toBe("9993");
    expect(warn("2.64")).toBe(false);
    expect(canonical("2.65", "gal")).toBe("10031");
    expect(warn("2.65")).toBe(true);
  });

  it("5: blank stays blank and rejected text stays invalid in every unit", () => {
    for (const unit of WATER_ENTRY_UNITS) {
      expect(canonical("", unit)).toBe("");
      expect(canonical("   ", unit).trim()).toBe("");
      for (const bad of ["abc", "-1", "1e3", "0", "0x10"]) {
        expect(assessWaterVolumeText(canonical(bad, unit)).status).toBe("invalid");
      }
      const long = "1".repeat(MAX_WATER_VOLUME_TEXT_LENGTH + 1);
      expect(assessWaterVolumeText(canonical(long, unit)).status).toBe("invalid");
    }
  });

  it("6: is deterministic", () => {
    for (const unit of WATER_ENTRY_UNITS) {
      expect(canonical("1.5", unit)).toBe(canonical("1.5", unit));
    }
  });
});

describe("display helpers", () => {
  it("7: shows stored ml in the entry unit", () => {
    expect(mlToWaterEntryDisplay(3785, "gal")).toBe("1");
    expect(mlToWaterEntryDisplay(1893, "gal")).toBe("0.5");
    expect(mlToWaterEntryDisplay(1500, "L")).toBe("1.5");
    expect(mlToWaterEntryDisplay(1500, "ml")).toBe("1500");
    expect(mlToWaterEntryDisplay(Number.NaN, "gal")).toBe("");
    // A positive amount never displays as 0.
    expect(mlToWaterEntryDisplay(1, "gal")).toBe("0.00026");
    expect(mlToWaterEntryDisplay(0.4, "L")).toBe("0.0004");
    expect(mlToWaterEntryDisplay(0, "gal")).toBe("0");
  });

  it("shows typed text first, else the canonical ml in the unit", () => {
    expect(waterEntryDisplayText("0.50", "1893", "gal")).toBe("0.50");
    expect(waterEntryDisplayText(undefined, "1893", "gal")).toBe("0.5");
    expect(waterEntryDisplayText(undefined, "1893", "ml")).toBe("1893");
    expect(waterEntryDisplayText(undefined, "", "L")).toBe("");
  });

  it("names the saved amount only for a valid volume", () => {
    expect(savesAsMlAmount("3785")).toBe("3,785");
    expect(savesAsMlAmount("")).toBeNull();
    expect(savesAsMlAmount("abc")).toBeNull();
    expect(savesAsMlAmount("50001")).toBeNull();
  });

  it("states the ceiling without overstating it", () => {
    expect(maxInWaterEntryUnit(50_000, "gal")).toBe("13.2");
    expect(maxInWaterEntryUnit(50_000, "L")).toBe("50");
    expect(maxInWaterEntryUnit(50_000, "ml")).toBe("50,000");
  });
});

describe("waterVolumeEntryUnitPreference (14, storage)", () => {
  // The shared setup seeds "ml" for older suites; this suite owns the default.
  beforeEach(() => {
    removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
  });

  it("defaults to L and remembers a chosen unit", () => {
    expect(loadWaterVolumeEntryUnit()).toBe("L");
    expect(saveWaterVolumeEntryUnit("gal")).toBe(true);
    expect(loadWaterVolumeEntryUnit()).toBe("gal");
    expect(getLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY)).toBe("gal");
  });

  it("falls back to L for an unknown stored value", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "quart");
    expect(loadWaterVolumeEntryUnit()).toBe("L");
  });

  it("falls back to L when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadWaterVolumeEntryUnit()).toBe("L");
  });
});

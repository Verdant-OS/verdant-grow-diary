import { describe, expect, it } from "vitest";
import {
  AIR_TEMP_C_RANGE,
  HUMIDITY_RANGE,
  SUBSTRATE_TEMP_C_RANGE,
  VWC_RANGE,
} from "@/constants/csvValidationRanges";
import { VPD_REALISTIC_RANGE } from "@/lib/manualSensorSnapshotQualityRules";
import { EC_MSCM_RANGE, PPFD_RANGE } from "@/lib/sensorReadingRangeValidation";
import {
  validateGrowTargetForm,
  type GrowTargetBound,
  type GrowTargetField,
} from "@/lib/growTargetValidationRules";

const ranges: Record<GrowTargetField, { min: number; max: number }> = {
  temp: AIR_TEMP_C_RANGE,
  rh: HUMIDITY_RANGE,
  vpd: VPD_REALISTIC_RANGE,
  soil_wc: VWC_RANGE,
  soil_ec: EC_MSCM_RANGE,
  soil_temp: SUBSTRATE_TEMP_C_RANGE,
  ppfd: PPFD_RANGE,
};
const fields = Object.keys(ranges) as GrowTargetField[];

describe("grow target entry validation (#2016)", () => {
  it("allows blank/absent optional bounds without inventing values", () => {
    const form = Object.fromEntries(
      fields.flatMap((field) => [
        [`${field}_min`, ""],
        [`${field}_max`, "  "],
      ]),
    );
    expect(validateGrowTargetForm(form, "celsius")).toEqual({ errors: {}, blocksSave: false });
    expect(validateGrowTargetForm({}, "fahrenheit")).toEqual({ errors: {}, blocksSave: false });
  });

  it.each(fields)(
    "accepts inclusive %s boundaries, equal pairs and either single bound",
    (field) => {
      const { min, max } = ranges[field];
      for (const form of [
        { [`${field}_min`]: String(min), [`${field}_max`]: String(max) },
        { [`${field}_min`]: String(min), [`${field}_max`]: String(min) },
        { [`${field}_min`]: String(max) },
        { [`${field}_max`]: String(min) },
      ])
        expect(validateGrowTargetForm(form, "celsius").blocksSave).toBe(false);
    },
  );

  it.each(fields)("rejects both sides of the %s physical limits for either endpoint", (field) => {
    const { min, max } = ranges[field];
    for (const bound of ["min", "max"] as const) {
      const key = `${field}_${bound}` as GrowTargetBound;
      for (const value of [min - 0.0001, max + 0.0001]) {
        const result = validateGrowTargetForm({ [key]: String(value) }, "celsius");
        expect(result.blocksSave).toBe(true);
        expect(result.errors[key]).toMatch(/between/);
        expect(Object.keys(result.errors)).toEqual([key]);
      }
    }
  });

  it.each(fields)("flags both endpoints of a reversed %s pair", (field) => {
    const { min, max } = ranges[field];
    const result = validateGrowTargetForm(
      { [`${field}_min`]: String(max), [`${field}_max`]: String(min) },
      "celsius",
    );
    expect(result.blocksSave).toBe(true);
    expect(result.errors[`${field}_min`]).toMatch(/min must be.*max/);
    expect(result.errors[`${field}_max`]).toMatch(/min must be.*max/);
  });

  it.each(["not-a-number", "NaN", "Infinity", "-Infinity", "1e309"])(
    "blocks non-empty invalid input %s on every bound",
    (raw) => {
      for (const field of fields) {
        for (const bound of ["min", "max"] as const) {
          const key = `${field}_${bound}` as GrowTargetBound;
          const result = validateGrowTargetForm({ [key]: raw }, "celsius");
          expect(result.blocksSave).toBe(true);
          expect(result.errors).toEqual({ [key]: "Enter a finite number." });
        }
      }
    },
  );

  it.each(["temp", "soil_temp"] as const)(
    "validates %s Fahrenheit limits and reports the display unit",
    (field) => {
      expect(
        validateGrowTargetForm({ [`${field}_min`]: "14", [`${field}_max`]: "122" }, "fahrenheit")
          .blocksSave,
      ).toBe(false);
      for (const bound of ["min", "max"] as const) {
        const key = `${field}_${bound}` as GrowTargetBound;
        for (const raw of ["13.9999", "122.0001"]) {
          const result = validateGrowTargetForm({ [key]: raw }, "fahrenheit");
          expect(result.errors[key]).toBe("Must be between 14 and 122 °F.");
        }
      }
      expect(validateGrowTargetForm({ [`${field}_min`]: "13.9999" }, "celsius").blocksSave).toBe(
        false,
      );
    },
  );

  it("collects every invalid and reversed range without hiding either reason", () => {
    const form = Object.fromEntries(
      fields.flatMap((field) => [
        [`${field}_min`, String(ranges[field].max + 1)],
        [`${field}_max`, String(ranges[field].min - 1)],
      ]),
    );
    const result = validateGrowTargetForm(form, "celsius");
    expect(result.blocksSave).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(14);
    for (const message of Object.values(result.errors)) {
      expect(message).toMatch(/between/);
      expect(message).toMatch(/min must be.*max/);
    }
  });

  it("is repeatable, does not mutate frozen input, and keeps zero valid where the shared limit permits it", () => {
    const form = Object.freeze({
      rh_min: " 0 ",
      soil_wc_min: "0",
      soil_ec_min: "0",
      ppfd_min: "0",
    });
    const result = validateGrowTargetForm(form, "fahrenheit");
    expect(result).toEqual({ errors: {}, blocksSave: false });
    expect(validateGrowTargetForm(form, "fahrenheit")).toEqual(result);
    expect(form.rh_min).toBe(" 0 ");
  });
});

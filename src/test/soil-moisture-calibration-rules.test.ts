import { describe, it, expect } from "vitest";
import {
  calibrateSoilMoisture,
  SoilMoistureCalibrationInputSchema,
} from "@/lib/soilMoistureCalibrationRules";

describe("calibrateSoilMoisture", () => {
  it("returns missing_input when any value is null or undefined", () => {
    expect(calibrateSoilMoisture(null, 100, 200)).toEqual({
      ok: false,
      calibratedValue: null,
      reason: "missing_input",
    });
    expect(calibrateSoilMoisture(150, null, 200).reason).toBe(
      "missing_input",
    );
    expect(calibrateSoilMoisture(150, 100, undefined).reason).toBe(
      "missing_input",
    );
  });

  it("returns invalid_input for NaN and Infinity", () => {
    expect(calibrateSoilMoisture(Number.NaN, 100, 200).reason).toBe(
      "invalid_input",
    );
    expect(calibrateSoilMoisture(Infinity, 100, 200).reason).toBe(
      "invalid_input",
    );
  });

  it("returns identical_points when dryRaw equals wetRaw", () => {
    expect(calibrateSoilMoisture(150, 200, 200)).toEqual({
      ok: false,
      calibratedValue: null,
      reason: "identical_points",
    });
  });

  it("maps a normal sensor correctly with dry as 0 percent and wet as 100 percent", () => {
    expect(calibrateSoilMoisture(100, 100, 300)).toEqual({
      ok: true,
      calibratedValue: 0,
      reason: "calibrated",
    });
    expect(calibrateSoilMoisture(300, 100, 300)).toEqual({
      ok: true,
      calibratedValue: 100,
      reason: "calibrated",
    });
  });

  it("maps an inverted sensor correctly with dry as 0 percent and wet as 100 percent", () => {
    expect(calibrateSoilMoisture(300, 300, 100)).toEqual({
      ok: true,
      calibratedValue: 0,
      reason: "calibrated",
    });
    expect(calibrateSoilMoisture(100, 300, 100)).toEqual({
      ok: true,
      calibratedValue: 100,
      reason: "calibrated",
    });
  });

  it("clamps values to 0 through 100", () => {
    expect(calibrateSoilMoisture(50, 100, 300)).toEqual({
      ok: true,
      calibratedValue: 0,
      reason: "calibrated",
    });
    expect(calibrateSoilMoisture(400, 100, 300)).toEqual({
      ok: true,
      calibratedValue: 100,
      reason: "calibrated",
    });
  });

  it("rounds to one decimal place", () => {
    expect(calibrateSoilMoisture(175, 100, 300)).toEqual({
      ok: true,
      calibratedValue: 37.5,
      reason: "calibrated",
    });
  });

  it("parses clean numeric strings via schema", () => {
    const result = SoilMoistureCalibrationInputSchema.safeParse({
      rawValue: "175",
      dryRaw: "100",
      wetRaw: "300",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ rawValue: 175, dryRaw: 100, wetRaw: 300 });
    }
  });

  it("rejects partial numeric strings", () => {
    const result = SoilMoistureCalibrationInputSchema.safeParse({
      rawValue: "123abc",
      dryRaw: 100,
      wetRaw: 200,
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty and whitespace strings", () => {
    expect(
      SoilMoistureCalibrationInputSchema.safeParse({
        rawValue: "",
        dryRaw: 100,
        wetRaw: 200,
      }).success,
    ).toBe(false);

    expect(
      SoilMoistureCalibrationInputSchema.safeParse({
        rawValue: "   ",
        dryRaw: 100,
        wetRaw: 200,
      }).success,
    ).toBe(false);
  });

  it("rejects Infinity and NaN through schema", () => {
    expect(
      SoilMoistureCalibrationInputSchema.safeParse({
        rawValue: Infinity,
        dryRaw: 100,
        wetRaw: 200,
      }).success,
    ).toBe(false);

    expect(
      SoilMoistureCalibrationInputSchema.safeParse({
        rawValue: NaN,
        dryRaw: 100,
        wetRaw: 200,
      }).success,
    ).toBe(false);
  });
});

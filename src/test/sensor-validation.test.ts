import { describe, it, expect } from "vitest";
import {
  validateEcWithUnit,
  validateHumidity,
  validatePh,
  validateTempC,
} from "@/lib/sensorValidation";

describe("sensorValidation plausibility", () => {
  it("flags pH outside realistic 3-9 range", () => {
    expect(validatePh(2.5)?.code).toBe("ph:implausible");
    expect(validatePh(9.5)?.code).toBe("ph:implausible");
    expect(validatePh(6.2)).toBeNull();
    expect(validatePh(null)).toBeNull();
    expect(validatePh("")).toBeNull();
    expect(validatePh("abc")).toBeNull();
  });

  it("flags EC above plausible max for the chosen unit", () => {
    expect(validateEcWithUnit(6, "mS/cm")?.code).toBe("ec:implausible");
    expect(validateEcWithUnit(1.4, "mS/cm")).toBeNull();
    // 1400 µS/cm = 1.4 mS/cm — well within range.
    expect(validateEcWithUnit(1400, "µS/cm")).toBeNull();
    // 800 ppm (×500) is fine; 5000 is too high.
    expect(validateEcWithUnit(800, "PPM-500")).toBeNull();
    expect(validateEcWithUnit(5000, "PPM-500")?.code).toBe("ec:implausible");
  });

  it("flags negative EC", () => {
    expect(validateEcWithUnit(-1, "mS/cm")?.code).toBe("ec:negative");
  });

  it("flags out-of-range temperature in Celsius", () => {
    expect(validateTempC(100)?.code).toBe("temp:implausible");
    expect(validateTempC(-20)?.code).toBe("temp:implausible");
    expect(validateTempC(24)).toBeNull();
  });

  it("flags stuck humidity (0% or 100%)", () => {
    expect(validateHumidity(0)?.code).toBe("rh:stuck");
    expect(validateHumidity(100)?.code).toBe("rh:stuck");
    expect(validateHumidity(55)).toBeNull();
  });
});

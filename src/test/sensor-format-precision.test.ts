import { describe, it, expect } from "vitest";
import {
  DERIVED_LABEL,
  formatSensorReading,
  formatSensorValue,
} from "@/lib/sensorFormat";

describe("sensorFormat precision", () => {
  it("rounds VPD to at most 2 decimals", () => {
    expect(formatSensorValue("vpd_kpa", 1.16432)).toBe("1.16 kPa");
    expect(formatSensorValue("vpd_kpa", 1.1)).toBe("1.10 kPa");
    expect(formatSensorValue("vpd_kpa", 1.16432)).not.toMatch(/\.\d{3,}/);
  });

  it("rounds EC to at most 2 decimals", () => {
    expect(formatSensorValue("reservoir_ec_mscm", 1.8523)).toBe("1.85 mS/cm");
    expect(formatSensorValue("soil_ec_mscm", 1.8523)).not.toMatch(/\.\d{3,}/);
  });

  it("formats temperature and RH with 1 decimal", () => {
    expect(formatSensorValue("air_temp_c", 24.345)).toBe("24.3 °C");
    expect(formatSensorValue("humidity_pct", 55)).toBe("55.0 %");
  });

  it("returns a long-dash for null/invalid input", () => {
    expect(formatSensorValue("vpd_kpa", null)).toBe("—");
    expect(formatSensorValue("vpd_kpa", undefined)).toBe("—");
    expect(formatSensorValue("vpd_kpa", Number.NaN)).toBe("—");
  });

  it("returns derived as a separate label, never appended to value", () => {
    const r = formatSensorReading({ field: "vpd_kpa", value: 1.16, derived: true });
    expect(r.value).toBe("1.16 kPa");
    expect(r.value).not.toMatch(/derived/i);
    expect(r.derived).toBe(true);
    expect(r.derivedLabel).toBe(DERIVED_LABEL);

    const r2 = formatSensorReading({ field: "vpd_kpa", value: 1.16 });
    expect(r2.derived).toBe(false);
    expect(r2.derivedLabel).toBeNull();
  });
});

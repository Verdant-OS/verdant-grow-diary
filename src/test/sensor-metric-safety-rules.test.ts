import { describe, it, expect } from "vitest";
import { detectSuspiciousMetrics } from "@/lib/sensor/sensorMetricSafetyRules";

describe("detectSuspiciousMetrics", () => {
  it("flags Fahrenheit value that looks like Celsius", () => {
    const flags = detectSuspiciousMetrics({ temp_f: 25 });
    expect(flags.some((f) => f.code === "temp_f_looks_celsius")).toBe(true);
  });

  it("does not flag plausible Fahrenheit temp", () => {
    const flags = detectSuspiciousMetrics({ temp_f: 75 });
    expect(flags.some((f) => f.code === "temp_f_looks_celsius")).toBe(false);
  });

  it("flags humidity stuck at 0 and 100", () => {
    expect(
      detectSuspiciousMetrics({ rh: 0 }).some((f) => f.code === "humidity_stuck_0"),
    ).toBe(true);
    expect(
      detectSuspiciousMetrics({ rh: 100 }).some((f) => f.code === "humidity_stuck_100"),
    ).toBe(true);
  });

  it("flags soil moisture stuck at 0 and 100", () => {
    expect(
      detectSuspiciousMetrics({ soil_moisture: 0 }).some((f) => f.code === "soil_stuck_0"),
    ).toBe(true);
    expect(
      detectSuspiciousMetrics({ soil_moisture: 100 }).some((f) => f.code === "soil_stuck_100"),
    ).toBe(true);
  });

  it("flags pH out of realistic range", () => {
    const flags = detectSuspiciousMetrics({ ph: 1.5 });
    expect(flags.some((f) => f.code === "ph_out_of_range")).toBe(true);
  });

  it("flags EC that looks like µS/cm when mS/cm expected", () => {
    const flags = detectSuspiciousMetrics({ ec: 1450 });
    expect(flags.some((f) => f.code === "ec_likely_microsiemens")).toBe(true);
  });

  it("does not flag plausible EC", () => {
    const flags = detectSuspiciousMetrics({ ec: 1.45 });
    expect(flags.some((f) => f.code === "ec_likely_microsiemens")).toBe(false);
  });

  it("flags non-finite and missing values", () => {
    expect(
      detectSuspiciousMetrics({ rh: NaN }).some((f) => f.code === "non_finite_value"),
    ).toBe(true);
    expect(
      detectSuspiciousMetrics({ ph: null }).some((f) => f.code === "missing_value"),
    ).toBe(true);
  });
});

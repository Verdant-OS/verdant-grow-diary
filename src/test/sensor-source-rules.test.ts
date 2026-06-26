import { describe, it, expect } from "vitest";
import {
  normalizeSensorSource,
  isHealthySensorSource,
  sensorSourceLabel,
} from "@/lib/sensor/sensorSourceRules";

describe("sensorSourceRules", () => {
  it("normalizes known aliases", () => {
    expect(normalizeSensorSource("LIVE")).toBe("live");
    expect(normalizeSensorSource("sensor")).toBe("live");
    expect(normalizeSensorSource("user")).toBe("manual");
    expect(normalizeSensorSource("mock")).toBe("demo");
    expect(normalizeSensorSource("import")).toBe("csv");
  });

  it("collapses unknown / missing / non-string to invalid", () => {
    expect(normalizeSensorSource("")).toBe("invalid");
    expect(normalizeSensorSource("   ")).toBe("invalid");
    expect(normalizeSensorSource(undefined)).toBe("invalid");
    expect(normalizeSensorSource(null)).toBe("invalid");
    expect(normalizeSensorSource(42)).toBe("invalid");
    expect(normalizeSensorSource("autopilot")).toBe("invalid");
  });

  it("only live is healthy", () => {
    expect(isHealthySensorSource("live")).toBe(true);
    for (const s of ["manual", "csv", "demo", "stale", "invalid"] as const) {
      expect(isHealthySensorSource(s)).toBe(false);
    }
  });

  it("labels are human-readable and distinct", () => {
    expect(sensorSourceLabel("demo")).toMatch(/demo/i);
    expect(sensorSourceLabel("stale")).toMatch(/stale/i);
    expect(sensorSourceLabel("invalid")).toMatch(/invalid/i);
    expect(sensorSourceLabel("live")).not.toMatch(/demo|stale|invalid/i);
  });
});

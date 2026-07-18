import { describe, it, expect } from "vitest";
import {
  normalizeSensorSource,
  isHealthySensorSource,
  sensorSourceLabel,
} from "@/lib/sensor/sensorSourceRules";

describe("sensorSourceRules", () => {
  it("accepts only exact canonical values", () => {
    for (const source of ["live", "manual", "csv", "demo", "stale", "invalid"] as const) {
      expect(normalizeSensorSource(source)).toBe(source);
    }
    for (const alias of ["LIVE", "sensor", "user", "mock", "import", " live "]) {
      expect(normalizeSensorSource(alias)).toBe("invalid");
    }
  });

  it("collapses unknown / missing / non-string to invalid", () => {
    expect(normalizeSensorSource("")).toBe("invalid");
    expect(normalizeSensorSource("   ")).toBe("invalid");
    expect(normalizeSensorSource(undefined)).toBe("invalid");
    expect(normalizeSensorSource(null)).toBe("invalid");
    expect(normalizeSensorSource(42)).toBe("invalid");
    expect(normalizeSensorSource("autopilot")).toBe("invalid");
  });

  it("only exact current Live proof is healthy", () => {
    expect(isHealthySensorSource("live", { quality: "ok", freshness: "fresh" })).toBe(true);
    expect(isHealthySensorSource("live")).toBe(false);
    for (const s of ["manual", "csv", "demo", "stale", "invalid"] as const) {
      expect(isHealthySensorSource(s)).toBe(false);
    }
  });

  it("labels are human-readable and distinct", () => {
    expect(sensorSourceLabel("demo")).toMatch(/demo/i);
    expect(sensorSourceLabel("stale")).toMatch(/stale/i);
    expect(sensorSourceLabel("invalid")).toMatch(/invalid/i);
    expect(sensorSourceLabel("live")).not.toMatch(/demo|stale|invalid/i);
    expect(sensorSourceLabel("live")).toMatch(/unverified/i);
    expect(sensorSourceLabel("live", { quality: "ok", freshness: "fresh" })).toBe("Live sensor");
  });
});

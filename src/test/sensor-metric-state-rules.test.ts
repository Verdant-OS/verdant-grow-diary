import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifySensorMetricState,
  isOptionalMetric,
  isCoreMetric,
  isOptionalMetricInvalid,
  isSoilMoistureStuck,
  type SensorMetricKey,
} from "@/lib/sensorMetricStateRules";

describe("sensorMetricStateRules", () => {
  it("classifies live reading as live + calm + chart", () => {
    const s = classifySensorMetricState({
      metric: "temp",
      value: 24,
      source: "sensor",
      hasAnyReading: true,
    });
    expect(s.kind).toBe("live");
    expect(s.tone).toBe("calm");
    expect(s.showChart).toBe(true);
  });

  it("classifies derived metric as derived + calm + chart", () => {
    const s = classifySensorMetricState({
      metric: "vpd",
      value: 1.2,
      hasAnyReading: true,
      isDerived: true,
    });
    expect(s.kind).toBe("derived");
    expect(s.label).toBe("Derived");
    expect(s.tone).toBe("calm");
  });

  it("classifies stale reading as cautionary", () => {
    const s = classifySensorMetricState({
      metric: "temp",
      value: 22,
      source: "sensor",
      hasAnyReading: true,
      isStale: true,
    });
    expect(s.kind).toBe("stale");
    expect(s.tone).toBe("caution");
  });

  it("classifies invalid telemetry as cautionary even without value", () => {
    const s = classifySensorMetricState({
      metric: "rh",
      value: 0,
      hasAnyReading: true,
      isInvalid: true,
    });
    expect(s.kind).toBe("invalid");
    expect(s.tone).toBe("caution");
  });

  it("optional CO2 with no reading is calm 'Not connected', never red", () => {
    const s = classifySensorMetricState({
      metric: "co2",
      value: null,
      hasAnyReading: false,
    });
    expect(s.kind).toBe("not_connected");
    expect(s.tone).toBe("calm");
    expect(s.isOptionalEmpty).toBe(true);
    expect(s.message.toLowerCase()).not.toContain("unavailable");
    expect(s.message).toMatch(/CO₂/);
  });

  it("optional PPFD with no reading is calm 'Not connected'", () => {
    const s = classifySensorMetricState({
      metric: "ppfd",
      value: null,
      hasAnyReading: false,
    });
    expect(s.kind).toBe("not_connected");
    expect(s.tone).toBe("calm");
    expect(s.message.toLowerCase()).not.toContain("unavailable");
  });

  it("optional soil moisture with no reading is calm", () => {
    const s = classifySensorMetricState({
      metric: "soil",
      value: null,
      hasAnyReading: true,
    });
    expect(s.tone).toBe("calm");
    expect(s.isOptionalEmpty).toBe(true);
  });

  it("VPD with no value and no temp/rh derived shows 'Needs temperature + humidity'", () => {
    const s = classifySensorMetricState({
      metric: "vpd",
      value: null,
      hasAnyReading: true,
    });
    expect(s.message).toBe("Needs temperature + humidity");
    expect(s.tone).toBe("calm");
    expect(s.message.toLowerCase()).not.toContain("unavailable");
  });

  it("manual/csv/demo source labels render correctly", () => {
    expect(
      classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: "manual",
        hasAnyReading: true,
      }).kind,
    ).toBe("manual");
    expect(
      classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: "csv",
        hasAnyReading: true,
      }).kind,
    ).toBe("csv");
    expect(
      classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: "demo",
        hasAnyReading: true,
      }).kind,
    ).toBe("demo");
  });

  it("metric classification helpers identify optional vs core", () => {
    expect(isOptionalMetric("co2")).toBe(true);
    expect(isOptionalMetric("ppfd")).toBe(true);
    expect(isOptionalMetric("soil")).toBe(true);
    expect(isCoreMetric("temp")).toBe(true);
    expect(isCoreMetric("rh")).toBe(true);
    expect(isCoreMetric("vpd")).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const a = classifySensorMetricState({
      metric: "co2",
      value: null,
      hasAnyReading: false,
    });
    const b = classifySensorMetricState({
      metric: "co2",
      value: null,
      hasAnyReading: false,
    });
    expect(a).toEqual(b);
  });
});

describe("sensorMetricStateRules static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/sensorMetricStateRules.ts"),
    "utf8",
  );
  const VPD_SRC = readFileSync(
    resolve(__dirname, "../lib/vpdCalculationRules.ts"),
    "utf8",
  );

  it("contains no AI / alerts / Action Queue / automation / device control imports", () => {
    for (const src of [SRC, VPD_SRC]) {
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/alerts?/i);
      expect(src).not.toMatch(/action[_-]?queue/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/ai[_-]?doctor/i);
      expect(src).not.toMatch(/device[_-]?control/i);
      expect(src).not.toMatch(/automation/i);
      expect(src).not.toMatch(/import\s+/);
    }
  });
});

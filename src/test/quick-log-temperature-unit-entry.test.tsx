/**
 * Quick Log manual readings — unit-aware temperature entry.
 *
 * The persisted contract key stays `temp_f`. What changes is that the grower
 * may TYPE in °C when that is their display preference; the value is
 * converted to °F exactly once on the way into the payload. A Celsius
 * grower typing "24" must never be stored as 24°F.
 */
import { describe, it, expect } from "vitest";

import { buildManualSensorSnapshot } from "@/lib/quickLogRules";
import { toFahrenheitInputString } from "@/lib/sensorInputUnitConversion";

function payloadSensors(temp: string, unit: "F" | "C") {
  return { temp: toFahrenheitInputString(temp, unit), humidity: "", ph: "", ec: "" };
}

describe("Quick Log temperature unit entry", () => {
  it("passes Fahrenheit entry straight through (no double conversion)", () => {
    const snap = buildManualSensorSnapshot(payloadSensors("75", "F"));
    expect(snap?.temp_f).toBe(75);
  });

  it("converts Celsius entry to °F exactly once", () => {
    const snap = buildManualSensorSnapshot(payloadSensors("24", "C"));
    expect(snap?.temp_f).toBeCloseTo(75.2, 6);
  });

  it("keeps the canonical source label and never fabricates other metrics", () => {
    const snap = buildManualSensorSnapshot(payloadSensors("20", "C"));
    expect(snap?.source).toBe("manual");
    expect(snap?.humidity_percent).toBeNull();
    expect(snap?.ph).toBeNull();
    expect(snap?.ec).toBeNull();
  });

  it("treats blank and unparseable temperature as absent, not zero", () => {
    for (const raw of ["", "   ", "abc", "--5"]) {
      expect(buildManualSensorSnapshot(payloadSensors(raw, "C"))).toBeNull();
      expect(buildManualSensorSnapshot(payloadSensors(raw, "F"))).toBeNull();
    }
  });

  it("is deterministic across repeated conversions of the same input", () => {
    const a = buildManualSensorSnapshot(payloadSensors("18.5", "C"));
    const b = buildManualSensorSnapshot(payloadSensors("18.5", "C"));
    expect(a).toEqual(b);
  });

  it("handles a sub-zero Celsius reading without sign loss", () => {
    const snap = buildManualSensorSnapshot(payloadSensors("-5", "C"));
    expect(snap?.temp_f).toBeCloseTo(23, 6);
  });
});

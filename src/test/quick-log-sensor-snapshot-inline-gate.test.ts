import { describe, expect, it } from "vitest";
import {
  assessQuickLogSensorSnapshotGate,
  QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE,
  QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE,
} from "@/lib/quickLogSensorSnapshotGateRules";

const base = { temperatureInput: "", humidityInput: "", vpdInput: "" };

describe("assessQuickLogSensorSnapshotGate", () => {
  it("blocks 500 °F with a message in the grower's unit", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      ...base,
      temperatureInput: "500",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.temperature).toBe("Temperature must be between 14 and 140 °F.");
    expect(gate.fields.temperature).not.toMatch(/°C/);
  });

  it("accepts the °F boundaries 14 and 140 and rejects just past them", () => {
    for (const t of ["14", "140", "77"]) {
      const gate = assessQuickLogSensorSnapshotGate({
        ...base,
        temperatureInput: t,
        temperatureUnit: "fahrenheit",
      });
      expect(gate.blocksSave).toBe(false);
    }
    for (const t of ["140.5", "13.5", "abc"]) {
      const gate = assessQuickLogSensorSnapshotGate({
        ...base,
        temperatureInput: t,
        temperatureUnit: "fahrenheit",
      });
      expect(gate.blocksSave).toBe(true);
    }
  });

  it("uses the °C message for a Celsius grower", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      ...base,
      temperatureInput: "61",
      temperatureUnit: "celsius",
    });
    expect(gate.fields.temperature).toBe("Temperature must be between -10 and 60 °C.");
  });

  it("blocks RH 150 and VPD 11", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      ...base,
      humidityInput: "150",
      vpdInput: "11",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.humidity).toBe(QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE);
    expect(gate.fields.vpd).toBe(QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE);
  });

  it("does not block empty or whitespace inputs (the snapshot is optional)", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: " ",
      humidityInput: "",
      vpdInput: null,
      temperatureUnit: "fahrenheit",
    });
    expect(gate).toEqual({ blocksSave: false, fields: {} });
  });

  it("is deterministic", () => {
    const input = { ...base, temperatureInput: "500", temperatureUnit: "fahrenheit" as const };
    expect(assessQuickLogSensorSnapshotGate(input)).toEqual(
      assessQuickLogSensorSnapshotGate(input),
    );
  });
});

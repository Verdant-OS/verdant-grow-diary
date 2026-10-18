import { describe, expect, it } from "vitest";
import {
  assessQuickLogSensorSnapshotGate,
  QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE,
  QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE,
  quickLogSnapshotTemperatureRangeMessage,
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

  it("rejects °F formats the save seam cannot convert instead of reading them as °C", () => {
    // 1e2 / 0x10 / Infinity bypass the sheet's plain-decimal °F conversion and
    // would reach the payload as °C; the gate must not accept them as °F.
    for (const t of ["1e2", "0x10", "Infinity", "7e1", "77f"]) {
      const gate = assessQuickLogSensorSnapshotGate({
        ...base,
        temperatureInput: t,
        temperatureUnit: "fahrenheit",
      });
      expect(gate.blocksSave, t).toBe(true);
      expect(gate.fields.temperature, t).toBe("Temperature must be between 14 and 140 °F.");
    }
    for (const t of ["+77", "50", "32.5", "77.", " 68.5 "]) {
      const gate = assessQuickLogSensorSnapshotGate({
        ...base,
        temperatureInput: t,
        temperatureUnit: "fahrenheit",
      });
      expect(gate.blocksSave, t).toBe(false);
    }
  });

  it("applies the save seam's 2 dp °C rounding before the canonical band", () => {
    // 140.004 °F -> 60.0022 °C, which the seam rounds to 60 and the payload accepts.
    const accepted = assessQuickLogSensorSnapshotGate({
      ...base,
      temperatureInput: "140.004",
      temperatureUnit: "fahrenheit",
    });
    expect(accepted.blocksSave).toBe(false);
    // 140.01 °F -> 60.0056 °C, rounds to 60.01 and is rejected by the payload.
    const rejected = assessQuickLogSensorSnapshotGate({
      ...base,
      temperatureInput: "140.01",
      temperatureUnit: "fahrenheit",
    });
    expect(rejected.blocksSave).toBe(true);
  });

  it("blocks humidity and VPD below their 0 floors and accepts the 0 floor itself", () => {
    const below = assessQuickLogSensorSnapshotGate({
      ...base,
      humidityInput: "-1",
      vpdInput: "-0.01",
      temperatureUnit: "celsius",
    });
    expect(below.blocksSave).toBe(true);
    expect(below.fields.humidity).toBe(QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE);
    expect(below.fields.vpd).toBe(QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE);

    const floor = assessQuickLogSensorSnapshotGate({
      ...base,
      humidityInput: "0",
      vpdInput: "0",
      temperatureUnit: "celsius",
    });
    expect(floor).toEqual({ blocksSave: false, fields: {}, footerMessage: null });

    const ceiling = assessQuickLogSensorSnapshotGate({
      ...base,
      humidityInput: "100",
      vpdInput: "10",
      temperatureUnit: "celsius",
    });
    expect(ceiling).toEqual({ blocksSave: false, fields: {}, footerMessage: null });
  });

  it("blocks non-numeric and non-finite humidity and VPD inputs", () => {
    for (const raw of ["abc", "Infinity", "-Infinity", "NaN", "50%"]) {
      const gate = assessQuickLogSensorSnapshotGate({
        ...base,
        humidityInput: raw,
        vpdInput: raw,
        temperatureUnit: "celsius",
      });
      expect(gate.blocksSave, raw).toBe(true);
      expect(gate.fields.humidity, raw).toBe(QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE);
      expect(gate.fields.vpd, raw).toBe(QUICK_LOG_SNAPSHOT_VPD_RANGE_MESSAGE);
    }
  });

  it("does not block empty or whitespace inputs (the snapshot is optional)", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: " ",
      humidityInput: "",
      vpdInput: null,
      temperatureUnit: "fahrenheit",
    });
    expect(gate).toEqual({ blocksSave: false, fields: {}, footerMessage: null });
  });

  it("is deterministic", () => {
    const input = { ...base, temperatureInput: "500", temperatureUnit: "fahrenheit" as const };
    expect(assessQuickLogSensorSnapshotGate(input)).toEqual(
      assessQuickLogSensorSnapshotGate(input),
    );
  });
});

describe("snapshot gate copy and footer", () => {
  it("owns its temperature copy, matching the canonical band in each unit", () => {
    expect(quickLogSnapshotTemperatureRangeMessage("fahrenheit")).toBe(
      "Temperature must be between 14 and 140 °F.",
    );
    expect(quickLogSnapshotTemperatureRangeMessage("celsius")).toBe(
      "Temperature must be between -10 and 60 °C.",
    );
  });

  it("reports the first failing field as the footer message", () => {
    const all = assessQuickLogSensorSnapshotGate({
      temperatureInput: "500",
      humidityInput: "150",
      vpdInput: "11",
      temperatureUnit: "fahrenheit",
    });
    expect(all.footerMessage).toBe("Temperature must be between 14 and 140 °F.");
    const rhOnly = assessQuickLogSensorSnapshotGate({
      temperatureInput: "",
      humidityInput: "150",
      vpdInput: "11",
      temperatureUnit: "fahrenheit",
    });
    expect(rhOnly.footerMessage).toBe(QUICK_LOG_SNAPSHOT_HUMIDITY_RANGE_MESSAGE);
  });
});

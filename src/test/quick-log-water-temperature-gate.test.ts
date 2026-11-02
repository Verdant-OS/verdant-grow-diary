/**
 * Inline water-temperature band for Quick Log Water, Feed, and the air
 * snapshot. Canonical storage stays -10..60 °C. Copy follows the grower's unit.
 */
import { describe, expect, it } from "vitest";

import { assessQuickLogSensorSnapshotGate } from "@/lib/quickLogSensorSnapshotGateRules";
import {
  assessQuickLogWaterTemperatureInput,
  quickLogWaterTemperatureRangeMessage,
} from "@/lib/quickLogWaterTemperatureGateRules";

const FAHRENHEIT_MESSAGE = "Water temperature must be between 14 and 140 °F.";
const CELSIUS_MESSAGE = "Water temperature must be between -10 and 60 °C.";

describe("quickLogWaterTemperatureRangeMessage", () => {
  it("names water temperature with Fahrenheit limits only", () => {
    expect(quickLogWaterTemperatureRangeMessage("fahrenheit")).toBe(FAHRENHEIT_MESSAGE);
  });

  it("keeps the Celsius band for a Celsius preference", () => {
    expect(quickLogWaterTemperatureRangeMessage("celsius")).toBe(CELSIUS_MESSAGE);
  });
});

describe("assessQuickLogWaterTemperatureInput — water and feed", () => {
  it.each(["14", "140", "70", "32"])("accepts %s °F", (raw) => {
    const gate = assessQuickLogWaterTemperatureInput({
      waterTemperatureInput: raw,
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(false);
    expect(gate.message).toBeNull();
  });

  it.each(["13.9", "140.1", "150", "-20"])("rejects %s °F and names the Fahrenheit band", (raw) => {
    const gate = assessQuickLogWaterTemperatureInput({
      waterTemperatureInput: raw,
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.message).toBe(FAHRENHEIT_MESSAGE);
  });

  it("accepts the Celsius endpoints and a blank value", () => {
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: "-10",
        temperatureUnit: "celsius",
      }).blocksSave,
    ).toBe(false);
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: "60",
        temperatureUnit: "celsius",
      }).blocksSave,
    ).toBe(false);
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: "  ",
        temperatureUnit: "fahrenheit",
      }),
    ).toEqual({ blocksSave: false, message: null });
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: null,
        temperatureUnit: "celsius",
      }),
    ).toEqual({ blocksSave: false, message: null });
  });

  it("rejects Celsius outside -10..60 and non-numeric text", () => {
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: "60.1",
        temperatureUnit: "celsius",
      }).message,
    ).toBe(CELSIUS_MESSAGE);
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: "-10.1",
        temperatureUnit: "celsius",
      }).message,
    ).toBe(CELSIUS_MESSAGE);
    expect(
      assessQuickLogWaterTemperatureInput({
        waterTemperatureInput: "hot",
        temperatureUnit: "fahrenheit",
      }).message,
    ).toBe(FAHRENHEIT_MESSAGE);
  });
});

describe("air snapshot temperature gate", () => {
  it("accepts 14 and 140 °F and rejects 13.9 and 140.1 °F", () => {
    for (const raw of ["14", "140"]) {
      const gate = assessQuickLogSensorSnapshotGate({
        temperatureInput: raw,
        humidityInput: "",
        vpdInput: "",
        temperatureUnit: "fahrenheit",
      });
      expect(gate.blocksSave, raw).toBe(false);
    }
    for (const raw of ["13.9", "140.1", "150"]) {
      const gate = assessQuickLogSensorSnapshotGate({
        temperatureInput: raw,
        humidityInput: "",
        vpdInput: "",
        temperatureUnit: "fahrenheit",
      });
      expect(gate.blocksSave, raw).toBe(true);
      expect(gate.fields.temperature, raw).toBe("Temperature must be between 14 and 140 °F.");
    }
  });

  it("keeps Celsius air copy on a Celsius preference", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: "61",
      humidityInput: "",
      vpdInput: "",
      temperatureUnit: "celsius",
    });
    expect(gate.fields.temperature).toBe("Temperature must be between -10 and 60 °C.");
  });
});

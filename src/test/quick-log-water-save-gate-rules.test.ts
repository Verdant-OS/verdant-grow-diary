import { describe, expect, it } from "vitest";

import {
  EMPTY_QUICKLOG_WATERING_FORM,
  QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE,
} from "@/lib/quickLogWateringFormViewModel";
import { assessQuickLogWaterSaveGate } from "@/lib/quickLogWaterSaveGateRules";

const blankAir = { temperatureC: "", humidityPct: "", vpdKpa: "" };

describe("assessQuickLogWaterSaveGate", () => {
  it("blocks an empty volume and names that problem", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: EMPTY_QUICKLOG_WATERING_FORM,
      ...blankAir,
      temperatureUnit: "celsius",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.volume).toBe("Enter the total water applied before saving.");
    expect(gate.footerMessage).toBe("Enter the total water applied before saving.");
  });

  it("blocks a negative or huge volume", () => {
    const negative = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "-50" },
      ...blankAir,
      temperatureUnit: "celsius",
    });
    expect(negative.blocksSave).toBe(true);
    expect(negative.fields.volume).toBe("Applied volume must be a positive number of milliliters.");

    const huge = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "1000001" },
      ...blankAir,
      temperatureUnit: "celsius",
    });
    expect(huge.blocksSave).toBe(true);
    expect(huge.fields.volume).toBe(QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE);
  });

  it("reports each bad air reading even when volume is also bad", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "-50" },
      temperatureC: "999",
      humidityPct: "150",
      vpdKpa: "-3",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(true);
    expect(gate.fields.volume).toBe("Applied volume must be a positive number of milliliters.");
    expect(gate.fields.temperature).toBe("Temperature must be between 14 and 140 °F.");
    expect(gate.fields.humidity).toBe("Humidity must be between 0 and 100%.");
    expect(gate.fields.vpd).toBe("VPD must be between 0 and 10 kPa.");
    expect(gate.footerMessage).toBe(gate.fields.volume);
  });

  it("states the Celsius band when the grower enters Celsius", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500" },
      temperatureC: "61",
      humidityPct: "",
      vpdKpa: "",
      temperatureUnit: "celsius",
    });
    expect(gate.fields.temperature).toBe("Temperature must be between -10 and 60 °C.");
    expect(gate.fields.volume).toBeUndefined();
  });

  it("allows a positive volume with blank optional readings", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500" },
      ...blankAir,
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(false);
    expect(gate.footerMessage).toBeNull();
    expect(gate.fields).toEqual({});
  });

  it("treats 70 °F as inside the canonical band", () => {
    const gate = assessQuickLogWaterSaveGate({
      form: { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500" },
      temperatureC: String(Math.round((((70 - 32) * 5) / 9) * 100) / 100),
      humidityPct: "55",
      vpdKpa: "1.2",
      temperatureUnit: "fahrenheit",
    });
    expect(gate.blocksSave).toBe(false);
    expect(gate.fields.temperature).toBeUndefined();
  });
});

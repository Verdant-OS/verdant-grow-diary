import { describe, it, expect, beforeEach } from "vitest";
import {
  SENSOR_CHART_METRIC_META,
  sensorChartUnit,
  sensorChartLegendLabel,
  formatSensorChartTooltipValue,
  formatSensorChartYTick,
  type SensorChartMetricKey,
} from "@/lib/sensorChartAxisRules";
import {
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

const METRICS: SensorChartMetricKey[] = ["temp", "rh", "vpd", "co2", "soil"];

describe("sensorChartUnit", () => {
  it("returns the unit string from the shared meta table", () => {
    expect(sensorChartUnit("temp")).toBe("°F");
    expect(sensorChartUnit("rh")).toBe("%");
    expect(sensorChartUnit("vpd")).toBe("kPa");
    expect(sensorChartUnit("co2")).toBe("ppm");
    expect(sensorChartUnit("soil")).toBe("%");
  });
});

describe("sensorChartLegendLabel", () => {
  it("renders metric name + unit in parentheses", () => {
    expect(sensorChartLegendLabel("temp")).toBe("Temperature (°F)");
    expect(sensorChartLegendLabel("rh")).toBe("Humidity (%)");
    expect(sensorChartLegendLabel("vpd")).toBe("VPD (kPa)");
    expect(sensorChartLegendLabel("co2")).toBe("CO₂ (ppm)");
    expect(sensorChartLegendLabel("soil")).toBe("Soil (%)");
  });

  it("never returns an empty label", () => {
    for (const m of METRICS) {
      expect(sensorChartLegendLabel(m).length).toBeGreaterThan(0);
    }
  });
});

describe("formatSensorChartTooltipValue", () => {
  it("appends the same unit string as the legend for every metric", () => {
    for (const m of METRICS) {
      const tooltip = formatSensorChartTooltipValue(42, m);
      const unit = sensorChartUnit(m);
      expect(tooltip.endsWith(unit)).toBe(true);
    }
  });

  it("returns empty string for non-finite input", () => {
    expect(formatSensorChartTooltipValue(NaN, "temp")).toBe("");
    expect(formatSensorChartTooltipValue(Infinity, "rh")).toBe("");
  });
});

describe("legend/tooltip unit source consistency (regression)", () => {
  it("legend label includes the exact unit used by tooltip formatting", () => {
    for (const m of METRICS) {
      const legend = sensorChartLegendLabel(m);
      const unit = sensorChartUnit(m);
      // legend embeds the unit verbatim
      expect(legend).toContain(unit);
      // tooltip formatting ends with the same unit token
      const tip = formatSensorChartTooltipValue(1.23, m);
      expect(tip.endsWith(unit)).toBe(true);
    }
  });

  it("there is only one metric/unit table — SENSOR_CHART_METRIC_META", () => {
    // Both helpers must read from the shared meta. If a future edit
    // re-introduces a parallel table, swapping the meta unit here would
    // also have to update the duplicate, which this guard prevents.
    //
    // Uses co2 rather than temp: temperature is deliberately NOT table-sourced
    // any more (see the °F/°C block below). Every other metric is unit-invariant
    // and must still come from the shared table.
    const originalUnit = SENSOR_CHART_METRIC_META.co2.unit;
    try {
      (SENSOR_CHART_METRIC_META as { co2: { unit: string } }).co2.unit = "TEST_UNIT";
      expect(sensorChartUnit("co2")).toBe("TEST_UNIT");
      expect(sensorChartLegendLabel("co2")).toContain("TEST_UNIT");
      expect(formatSensorChartTooltipValue(1, "co2").endsWith("TEST_UNIT")).toBe(true);
    } finally {
      (SENSOR_CHART_METRIC_META as { co2: { unit: string } }).co2.unit = originalUnit;
    }
  });
});

describe("temperature labels follow the saved °F/°C preference", () => {
  beforeEach(() => {
    clearTemperatureUnitPreference();
  });

  it("defaults to °F when nothing is saved (parity with prior behavior)", () => {
    expect(sensorChartUnit("temp")).toBe("°F");
    expect(sensorChartLegendLabel("temp")).toBe("Temperature (°F)");
    expect(formatSensorChartTooltipValue(72, "temp")).toBe("72°F");
    expect(formatSensorChartYTick(72, "temp")).toBe("72°F");
  });

  it("switches every chart surface to °C together", () => {
    saveTemperatureUnitPreference("celsius");
    expect(sensorChartUnit("temp")).toBe("°C");
    expect(sensorChartLegendLabel("temp")).toBe("Temperature (°C)");
    expect(formatSensorChartTooltipValue(22, "temp")).toBe("22°C");
    expect(formatSensorChartYTick(22, "temp")).toBe("22°C");
  });

  it("honors an explicit unit argument over the saved preference", () => {
    saveTemperatureUnitPreference("celsius");
    expect(sensorChartUnit("temp", "fahrenheit")).toBe("°F");
    expect(sensorChartLegendLabel("temp", "fahrenheit")).toBe("Temperature (°F)");
    expect(formatSensorChartTooltipValue(72, "temp", "fahrenheit")).toBe("72°F");
    expect(formatSensorChartYTick(72, "temp", "fahrenheit")).toBe("72°F");
  });

  it("axis, tooltip and legend can never disagree about the unit", () => {
    for (const pref of ["fahrenheit", "celsius"] as const) {
      saveTemperatureUnitPreference(pref);
      const unit = sensorChartUnit("temp");
      expect(sensorChartLegendLabel("temp"), pref).toContain(unit);
      expect(formatSensorChartTooltipValue(20, "temp").endsWith(unit), pref).toBe(true);
      expect(formatSensorChartYTick(20, "temp").endsWith(unit), pref).toBe(true);
    }
  });

  it("leaves non-temperature metrics untouched under either preference", () => {
    for (const pref of ["fahrenheit", "celsius"] as const) {
      saveTemperatureUnitPreference(pref);
      expect(sensorChartUnit("rh"), pref).toBe("%");
      expect(sensorChartUnit("vpd"), pref).toBe("kPa");
      expect(sensorChartUnit("co2"), pref).toBe("ppm");
      expect(sensorChartUnit("soil"), pref).toBe("%");
      expect(sensorChartUnit("ppfd"), pref).toBe("µmol/m²/s");
    }
  });
});

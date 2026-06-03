import { describe, it, expect } from "vitest";
import {
  SENSOR_CHART_METRIC_META,
  sensorChartUnit,
  sensorChartLegendLabel,
  formatSensorChartTooltipValue,
  type SensorChartMetricKey,
} from "@/lib/sensorChartAxisRules";

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
    const originalUnit = SENSOR_CHART_METRIC_META.temp.unit;
    try {
      (SENSOR_CHART_METRIC_META as { temp: { unit: string } }).temp.unit = "TEST_UNIT";
      expect(sensorChartUnit("temp")).toBe("TEST_UNIT");
      expect(sensorChartLegendLabel("temp")).toContain("TEST_UNIT");
      expect(formatSensorChartTooltipValue(1, "temp").endsWith("TEST_UNIT")).toBe(true);
    } finally {
      (SENSOR_CHART_METRIC_META as { temp: { unit: string } }).temp.unit = originalUnit;
    }
  });
});

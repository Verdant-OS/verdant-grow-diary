/**
 * Unit consistency tests for SensorChart metric helpers.
 *
 * Ensures the legend label and the tooltip value formatter both read
 * from the same unit source, so a unit string can never drift between
 * the chip in the chart header and the value shown in the tooltip.
 * Also covers extended metric keys (soil moisture, soil/reservoir EC,
 * pH) used by non-chart surfaces and null/NaN safety.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getSensorMetricUnit,
  formatSensorMetricLabel,
  formatSensorMetricValue,
} from "@/lib/sensorChartMetricUnits";
import {
  sensorChartLegendLabel,
  formatSensorChartTooltipValue,
  SENSOR_CHART_METRIC_META,
} from "@/lib/sensorChartAxisRules";

describe("getSensorMetricUnit", () => {
  it("returns canonical units for chart metrics", () => {
    expect(getSensorMetricUnit("temp")).toBe("°F");
    expect(getSensorMetricUnit("rh")).toBe("%");
    expect(getSensorMetricUnit("vpd")).toBe("kPa");
    expect(getSensorMetricUnit("co2")).toBe("ppm");
    expect(getSensorMetricUnit("soil")).toBe("%");
  });

  it("returns extended units for non-chart metrics", () => {
    expect(getSensorMetricUnit("soil_moisture")).toBe("%");
    expect(getSensorMetricUnit("soil_ec")).toBe("mS/cm");
    expect(getSensorMetricUnit("res_ec")).toBe("mS/cm");
    expect(getSensorMetricUnit("res_ph")).toBe("");
    expect(getSensorMetricUnit("ph")).toBe("");
  });
});

describe("formatSensorMetricLabel", () => {
  it("appends unit in parentheses when present", () => {
    expect(formatSensorMetricLabel("temp")).toBe("Temperature (°F)");
    expect(formatSensorMetricLabel("vpd")).toBe("VPD (kPa)");
    expect(formatSensorMetricLabel("co2")).toBe("CO₂ (ppm)");
    expect(formatSensorMetricLabel("soil_ec")).toBe("Soil EC (mS/cm)");
  });

  it("renders unit-less metrics as the plain label", () => {
    expect(formatSensorMetricLabel("ph")).toBe("pH");
    expect(formatSensorMetricLabel("res_ph")).toBe("Reservoir pH");
  });
});

describe("formatSensorMetricValue", () => {
  it("formats numeric values with the metric unit", () => {
    expect(formatSensorMetricValue("temp", 72)).toBe("72°F");
    expect(formatSensorMetricValue("vpd", 1.1)).toBe("1.1 kPa");
    expect(formatSensorMetricValue("co2", 800)).toBe("800 ppm");
    expect(formatSensorMetricValue("soil_ec", 2.4)).toBe("2.4 mS/cm");
  });

  it("returns plain number string for unit-less metrics", () => {
    expect(formatSensorMetricValue("ph", 6.2)).toBe("6.2");
  });

  it("renders null / undefined / NaN / Infinity safely", () => {
    expect(formatSensorMetricValue("temp", null)).toBe("");
    expect(formatSensorMetricValue("temp", undefined)).toBe("");
    expect(formatSensorMetricValue("temp", Number.NaN)).toBe("");
    expect(formatSensorMetricValue("temp", Number.POSITIVE_INFINITY)).toBe("");
    expect(formatSensorMetricValue("vpd", Number.NaN)).not.toContain("NaN");
  });
});

describe("legend / tooltip unit consistency", () => {
  it("legend label and tooltip value formatter use the same unit string for every chart metric", () => {
    (Object.keys(SENSOR_CHART_METRIC_META) as Array<keyof typeof SENSOR_CHART_METRIC_META>).forEach((m) => {
      const legend = sensorChartLegendLabel(m);
      const tooltip = formatSensorChartTooltipValue(1, m);
      const unit = SENSOR_CHART_METRIC_META[m].unit;
      if (unit) {
        expect(legend).toContain(unit);
        expect(tooltip).toContain(unit);
      }
      // Extended helper must agree with the chart helper on the unit.
      expect(getSensorMetricUnit(m)).toBe(unit);
    });
  });
});

describe("static guardrail: SensorChart.tsx does not duplicate the metric/unit table", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/SensorChart.tsx"),
    "utf8",
  );

  it("does not inline a metric → unit map inside SensorChart.tsx", () => {
    // No literal mapping like `temp: { unit: "°F" ... }` should live in JSX.
    expect(src).not.toMatch(/temp:\s*\{[^}]*unit:/);
    expect(src).not.toMatch(/rh:\s*\{[^}]*unit:/);
  });

  it("imports unit metadata from the shared rules module", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/sensorChartAxisRules["']/);
    expect(src).toContain("sensorChartLegendLabel");
    expect(src).toContain("formatSensorChartTooltipValue");
  });

  it("does not hand-roll unit suffixes like \"°F\" / \"kPa\" / \"ppm\" inside JSX strings", () => {
    // Allow inside imports/comments only — assert there are no bare
    // string literals carrying these unit suffixes in the component.
    expect(src).not.toMatch(/["'`][^"'`]*°F[^"'`]*["'`]/);
    expect(src).not.toMatch(/["'`][^"'`]*\bkPa\b[^"'`]*["'`]/);
    expect(src).not.toMatch(/["'`][^"'`]*\bppm\b[^"'`]*["'`]/);
  });
});

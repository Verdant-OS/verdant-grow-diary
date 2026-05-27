/**
 * AUD-006 — SensorChart Y-axis labels were clipped because the axis had a
 * hard-coded 36px gutter and printed compound units inline. These tests
 * lock in the pure formatter + per-metric gutter widths that prevent
 * clipping for negative temps and wide units (ppm / kPa).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SENSOR_CHART_METRIC_META,
  SENSOR_CHART_LEFT_MARGIN,
  formatSensorChartYTick,
  formatSensorChartTooltipValue,
  type SensorChartMetricKey,
} from "@/lib/sensorChartAxisRules";

describe("AUD-006 sensorChartAxisRules.formatSensorChartYTick", () => {
  it("appends attached units without a leading space", () => {
    expect(formatSensorChartYTick(78, "temp")).toBe("78°F");
    expect(formatSensorChartYTick(55, "rh")).toBe("55%");
    expect(formatSensorChartYTick(40, "soil")).toBe("40%");
  });

  it("appends compound units with a hair of separation", () => {
    expect(formatSensorChartYTick(1200, "co2")).toBe("1200 ppm");
    expect(formatSensorChartYTick(1.18, "vpd")).toBe("1.18 kPa");
  });

  it("renders negative values intact (no truncated minus sign)", () => {
    expect(formatSensorChartYTick(-5, "temp")).toBe("-5°F");
    expect(formatSensorChartYTick(-0.25, "vpd")).toBe("-0.25 kPa");
  });

  it("rounds to the metric's preferred decimal count", () => {
    expect(formatSensorChartYTick(72.49, "temp")).toBe("72°F");
    expect(formatSensorChartYTick(1.235, "vpd")).toBe("1.24 kPa");
  });

  it("returns an empty string for non-finite values rather than NaN", () => {
    expect(formatSensorChartYTick(NaN, "temp")).toBe("");
    expect(formatSensorChartYTick(Infinity, "co2")).toBe("");
  });

  it("is deterministic", () => {
    for (const metric of Object.keys(SENSOR_CHART_METRIC_META) as SensorChartMetricKey[]) {
      const a = formatSensorChartYTick(42, metric);
      const b = formatSensorChartYTick(42, metric);
      expect(a).toBe(b);
    }
  });
});

describe("AUD-006 sensorChartAxisRules.formatSensorChartTooltipValue", () => {
  it("matches the on-axis style for compact + compound units", () => {
    expect(formatSensorChartTooltipValue(78.4, "temp")).toBe("78.4°F");
    expect(formatSensorChartTooltipValue(1200, "co2")).toBe("1200 ppm");
    expect(formatSensorChartTooltipValue(1.18, "vpd")).toBe("1.18 kPa");
  });
});

describe("AUD-006 per-metric YAxis gutter widths", () => {
  it("reserves enough room for the widest expected tick", () => {
    // Wide units need more gutter than attached units.
    expect(SENSOR_CHART_METRIC_META.co2.yAxisWidth).toBeGreaterThanOrEqual(56);
    expect(SENSOR_CHART_METRIC_META.vpd.yAxisWidth).toBeGreaterThanOrEqual(56);
    // Temperature must fit a negative sign + °F.
    expect(SENSOR_CHART_METRIC_META.temp.yAxisWidth).toBeGreaterThanOrEqual(40);
    // All metrics must beat the old 36px default that caused the clipping.
    for (const m of Object.values(SENSOR_CHART_METRIC_META)) {
      expect(m.yAxisWidth).toBeGreaterThan(36);
    }
  });

  it("reserves a small left chart margin so the first tick is not flush with the gutter", () => {
    expect(SENSOR_CHART_LEFT_MARGIN).toBeGreaterThan(0);
  });
});

describe("AUD-006 SensorChart wires the helper", () => {
  const SRC = readFileSync(
    resolve(__dirname, "..", "components", "SensorChart.tsx"),
    "utf8",
  );

  it("uses the per-metric YAxis width helper instead of a hard-coded 36px gutter", () => {
    expect(SRC).toMatch(/axisMeta\.yAxisWidth/);
    expect(SRC).not.toMatch(/width=\{36\}/);
  });

  it("uses the shared tick + tooltip formatters", () => {
    expect(SRC).toMatch(/formatSensorChartYTick/);
    expect(SRC).toMatch(/formatSensorChartTooltipValue/);
  });

  it("reserves a non-zero left margin", () => {
    expect(SRC).toMatch(/SENSOR_CHART_LEFT_MARGIN/);
    expect(SRC).not.toMatch(/left:\s*0\b/);
  });
});

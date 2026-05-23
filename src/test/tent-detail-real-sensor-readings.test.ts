/**
 * Static guardrails: TentDetail must use real persisted sensor_readings
 * (not the useMockData useSensorReadings hook), surface an honest empty
 * state when there are none, preserve stale/source labeling, and add no
 * unsafe device/automation paths.
 *
 * Also covers the pure rules helper that shapes rows for the chart.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTentSensorChartSeries,
  buildTentSensorHeaderView,
} from "@/lib/tentSensorChartRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";

const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const RULES = read("src/lib/tentSensorChartRules.ts");

describe("TentDetail · real sensor readings", () => {
  it("does not import useSensorReadings from useMockData", () => {
    expect(TENT_DETAIL).not.toMatch(
      /from\s+["']@\/hooks\/useMockData["']/,
    );
  });

  it("imports the real sensor_readings hook", () => {
    expect(TENT_DETAIL).toMatch(
      /from\s+["']@\/hooks\/use-sensor-readings["']/,
    );
  });

  it("uses the pure chart rules helper", () => {
    expect(TENT_DETAIL).toContain("buildTentSensorChartSeries");
    expect(TENT_DETAIL).toContain("buildTentSensorHeaderView");
  });

  it("shows an honest empty state when no readings exist", () => {
    expect(TENT_DETAIL).toContain("No sensor readings yet.");
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-sensor-empty"');
  });

  it("preserves stale and source labeling", () => {
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-sensor-stale"');
    expect(TENT_DETAIL).toContain('data-testid="tent-detail-sensor-source"');
  });

  it("introduces no unsafe device/automation surfaces", () => {
    const FORBIDDEN = [
      "service_role",
      "mqtt",
      "home_assistant",
      "pi_bridge",
      "actuator",
      "device_command",
      "autopilot",
      "writeWateringTypedEvent",
      "action_queue",
      "Leads",
    ];
    for (const needle of FORBIDDEN) {
      expect(TENT_DETAIL).not.toContain(needle);
      expect(RULES).not.toContain(needle);
    }
  });
});

describe("buildTentSensorChartSeries", () => {
  it("returns [] for empty/null input", () => {
    expect(buildTentSensorChartSeries(null)).toEqual([]);
    expect(buildTentSensorChartSeries([])).toEqual([]);
  });

  it("groups multi-metric rows by timestamp and sorts ascending", () => {
    const rows = [
      { ts: "2025-01-02T00:00:00Z", metric: "temperature_c", value: 24, source: "live" },
      { ts: "2025-01-01T00:00:00Z", metric: "temperature_c", value: 22, source: "live" },
      { ts: "2025-01-01T00:00:00Z", metric: "humidity_pct", value: 55, source: "live" },
    ];
    const out = buildTentSensorChartSeries(rows);
    expect(out).toEqual([
      { ts: "2025-01-01T00:00:00Z", temp: 22, rh: 55, vpd: null, co2: null, soil: null },
      { ts: "2025-01-02T00:00:00Z", temp: 24, rh: null, vpd: null, co2: null, soil: null },
    ]);
  });

  it("ignores unknown metrics and non-finite values, does not invent data", () => {
    const rows = [
      { ts: "2025-01-01T00:00:00Z", metric: "weird_metric", value: 1, source: "live" },
      { ts: "2025-01-01T00:00:00Z", metric: "temperature_c", value: "nope", source: "live" },
    ];
    expect(buildTentSensorChartSeries(rows)).toEqual([]);
  });
});

describe("buildTentSensorHeaderView", () => {
  it("reports no readings for empty input", () => {
    const v = buildTentSensorHeaderView([]);
    expect(v.hasReadings).toBe(false);
    expect(v.snapshot).toBeNull();
  });

  it("marks readings as stale past the threshold and exposes a source label", () => {
    const now = Date.UTC(2025, 0, 2, 0, 0, 0);
    const oldTs = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const rows = [
      { ts: oldTs, metric: "temperature_c", value: 23, source: "live" },
    ];
    const v = buildTentSensorHeaderView(rows, now);
    expect(v.hasReadings).toBe(true);
    expect(v.stale).toBe(true);
    expect(v.sourceLabel).toBe("Live sensor");
  });
});

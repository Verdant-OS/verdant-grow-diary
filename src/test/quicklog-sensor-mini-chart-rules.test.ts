/**
 * Pure tests for the Quick Log sensor mini-chart helpers. Deterministic,
 * no network, no React.
 */
import { describe, it, expect } from "vitest";
import {
  buildMiniChartPath,
  buildMiniChartSeries,
  type MiniChartRawRow,
} from "@/lib/quickLogSensorMiniChartRules";

const NOW = new Date("2026-06-08T12:00:00Z");

function tempRows(): MiniChartRawRow[] {
  // Mix of temperature_c (canonicalized) and an out-of-window sample.
  return [
    { metric: "temperature_c", value: 24, captured_at: "2026-06-08T11:00:00Z" },
    { metric: "temperature_c", value: 25, captured_at: "2026-06-08T11:30:00Z" },
    { metric: "temperature_c", value: 23, captured_at: "2026-06-08T10:00:00Z" },
    { metric: "humidity_pct", value: 55, captured_at: "2026-06-08T11:00:00Z" },
    // 36h ago — outside the default 24h window
    { metric: "temperature_c", value: 99, captured_at: "2026-06-07T00:00:00Z" },
    // junk
    { metric: "temperature_c", value: "abc", captured_at: "2026-06-08T11:15:00Z" },
    { metric: "temperature_c", value: 22, captured_at: null, ts: null },
  ];
}

describe("buildMiniChartSeries", () => {
  it("returns empty series for empty input", () => {
    const s = buildMiniChartSeries([], { metric: "temp_c", now: NOW });
    expect(s.points).toEqual([]);
    expect(s.latestTs).toBeNull();
    expect(s.latestValue).toBeNull();
  });

  it("filters by metric, drops out-of-window and non-finite values", () => {
    const s = buildMiniChartSeries(tempRows(), { metric: "temp_c", now: NOW });
    expect(s.points).toHaveLength(3);
    // Ordered oldest → newest
    expect(s.points.map((p) => p.v)).toEqual([23, 24, 25]);
    expect(s.min).toBe(23);
    expect(s.max).toBe(25);
    expect(s.latestValue).toBe(25);
    expect(s.unitLabel).toBe("°C");
  });

  it("ignores other metrics for the requested key", () => {
    const s = buildMiniChartSeries(tempRows(), { metric: "humidity_pct", now: NOW });
    expect(s.points).toHaveLength(1);
    expect(s.latestValue).toBe(55);
    expect(s.unitLabel).toBe("%");
  });

  it("returns empty when no usable samples for the metric", () => {
    const s = buildMiniChartSeries(tempRows(), { metric: "vpd_kpa", now: NOW });
    expect(s.points).toEqual([]);
    expect(s.latestValue).toBeNull();
  });
});

describe("buildMiniChartPath", () => {
  it("returns null when series has <2 points", () => {
    const s = buildMiniChartSeries(
      [{ metric: "temperature_c", value: 24, captured_at: "2026-06-08T11:00:00Z" }],
      { metric: "temp_c", now: NOW },
    );
    expect(buildMiniChartPath(s, { width: 100, height: 30 })).toBeNull();
  });

  it("returns null for non-positive dimensions", () => {
    const s = buildMiniChartSeries(tempRows(), { metric: "temp_c", now: NOW });
    expect(buildMiniChartPath(s, { width: 0, height: 30 })).toBeNull();
    expect(buildMiniChartPath(s, { width: 100, height: 0 })).toBeNull();
  });

  it("emits an M…L… SVG path scaled to viewport", () => {
    const s = buildMiniChartSeries(tempRows(), { metric: "temp_c", now: NOW });
    const d = buildMiniChartPath(s, { width: 100, height: 30, padding: 2 });
    expect(d).toBeTypeOf("string");
    expect(d!.startsWith("M")).toBe(true);
    expect(d!.split("L").length - 1).toBe(s.points.length - 1);
    // Latest (max) point should pin to top padding; oldest min → bottom padding.
    const segments = d!.match(/-?\d+\.\d+/g)!.map(Number);
    // First coord pair = first (oldest) point
    expect(segments[0]).toBe(0); // x at t=tMin
    // Last coord pair = newest point
    expect(segments[segments.length - 2]).toBeCloseTo(100, 1);
  });
});

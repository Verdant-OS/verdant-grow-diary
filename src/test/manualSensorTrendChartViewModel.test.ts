/**
 * View-model tests for buildManualSensorTrendChartViewModel.
 *
 * Locks: deterministic chronological order, unit-aware formatting,
 * calm partial-context states, stale/invalid/demo readings flagged
 * (never treated as healthy), null-safe inputs.
 */
import { describe, it, expect } from "vitest";
import {
  buildManualSensorTrendChartViewModel,
  type ManualSensorTrendInputRow,
} from "@/lib/manualSensorTrendChartViewModel";

function row(
  overrides: Partial<ManualSensorTrendInputRow>,
): ManualSensorTrendInputRow {
  return {
    ts: "2026-06-20T10:00:00.000Z",
    metric: "ppfd",
    value: 400,
    source: "manual",
    quality: "ok",
    ...overrides,
  };
}

describe("buildManualSensorTrendChartViewModel", () => {
  it("builds ready state when PPFD + environment context are present", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "ppfd", value: 412, ts: "2026-06-20T10:00:00Z" }),
        row({ metric: "temperature_c", value: 24, ts: "2026-06-20T10:00:00Z" }),
        row({ metric: "humidity_pct", value: 55, ts: "2026-06-20T10:00:00Z" }),
        row({ metric: "vpd_kpa", value: 1.1, ts: "2026-06-20T10:00:00Z" }),
      ],
    });
    expect(vm.state).toBe("ready");
    expect(vm.emptyMessage).toBeNull();
    expect(vm.title).toBe("PPFD and environment context");
    expect(vm.description).toMatch(/not an automated diagnosis/i);
    expect(vm.series.map((s) => s.metric)).toEqual([
      "ppfd",
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
    ]);
    expect(vm.series[0].points[0].display).toBe("412 µmol/m²/s");
    expect(vm.series[1].points[0].display).toBe("75.2°F"); // 24C -> 75.2F
    expect(vm.series[2].points[0].display).toBe("55% RH");
    expect(vm.series[3].points[0].display).toBe("1.10 kPa");
    expect(vm.series.map((s) => s.unit)).toEqual([
      "µmol/m²/s",
      "°F",
      "% RH",
      "kPa",
    ]);
  });

  it("returns no_ppfd state when environment present but PPFD missing", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "temperature_c", value: 22, ts: "2026-06-20T10:00:00Z" }),
        row({ metric: "humidity_pct", value: 60, ts: "2026-06-20T10:00:00Z" }),
      ],
    });
    expect(vm.state).toBe("no_ppfd");
    expect(vm.emptyMessage).toMatch(/no ppfd readings/i);
  });

  it("returns ppfd_only_no_environment when only PPFD logged", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [row({ metric: "ppfd", value: 500 })],
    });
    expect(vm.state).toBe("ppfd_only_no_environment");
    expect(vm.emptyMessage).toMatch(/no temperature, humidity, or vpd/i);
  });

  it("returns stale_invalid_only when only stale/invalid readings exist", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "ppfd", value: 300, source: "stale" }),
        row({ metric: "temperature_c", value: 20, source: "invalid" }),
      ],
    });
    expect(vm.state).toBe("stale_invalid_only");
    expect(vm.emptyMessage).toMatch(/stale or invalid/i);
    expect(vm.series.every((s) => s.points.length === 0)).toBe(true);
    expect(vm.flagged.length).toBe(2);
    expect(vm.flagged.map((p) => p.source).sort()).toEqual([
      "invalid",
      "stale",
    ]);
  });

  it("flags demo readings as not-healthy and does not include them in series", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "ppfd", value: 600, source: "manual" }),
        row({ metric: "temperature_c", value: 24, source: "manual" }),
        row({ metric: "ppfd", value: 999, source: "demo" }),
      ],
    });
    expect(vm.state).toBe("ready");
    expect(vm.series[0].points).toHaveLength(1);
    expect(vm.series[0].points[0].value).toBe(600);
    expect(vm.flagged).toHaveLength(1);
    expect(vm.flagged[0].source).toBe("demo");
    expect(vm.omissions.find((o) => o.reason === "demo")).toBeTruthy();
  });

  it("preserves chronological order (oldest -> newest)", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "ppfd", value: 100, ts: "2026-06-22T10:00:00Z" }),
        row({ metric: "temperature_c", value: 24, ts: "2026-06-20T10:00:00Z" }),
        row({ metric: "ppfd", value: 200, ts: "2026-06-21T10:00:00Z" }),
        row({ metric: "humidity_pct", value: 55, ts: "2026-06-20T10:00:00Z" }),
      ],
    });
    const ppfd = vm.series[0].points.map((p) => p.value);
    expect(ppfd).toEqual([200, 100]);
    const allTs = vm.series.flatMap((s) =>
      s.points.map((p) => Date.parse(p.capturedAt)),
    );
    const sorted = [...allTs].sort((a, b) => a - b);
    expect(allTs).toEqual(sorted);
  });

  it("is null-safe for missing/invalid fields and never crashes", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "ppfd", value: "not-a-number" }),
        row({ metric: undefined, value: 10 }),
        row({ ts: "", value: 10 }),
        row({ metric: "ppfd", value: null }),
        row({ metric: "unknown_metric", value: 10 }),
        row({ metric: "ppfd", value: 350, source: undefined }),
        row({ metric: "temperature_c", value: 22 }),
      ],
    });
    expect(vm.state).toBe("ready");
    expect(vm.series[0].points).toHaveLength(1);
    expect(vm.series[0].points[0].value).toBe(350);
    expect(vm.omissions.some((o) => o.reason === "non_finite")).toBe(true);
    expect(vm.omissions.some((o) => o.reason === "unknown_metric")).toBe(true);
    expect(vm.omissions.some((o) => o.reason === "missing_timestamp")).toBe(
      true,
    );
  });

  it("handles empty/undefined input as no_ppfd without crashing", () => {
    expect(buildManualSensorTrendChartViewModel({ readings: [] }).state).toBe(
      "no_ppfd",
    );
    // @ts-expect-error — verifying defensive runtime behavior
    expect(buildManualSensorTrendChartViewModel({}).state).toBe("no_ppfd");
  });

  it("formats temperature in °F using the existing app preference unit", () => {
    const vm = buildManualSensorTrendChartViewModel({
      readings: [
        row({ metric: "ppfd", value: 400 }),
        row({ metric: "temperature_c", value: 0 }),
      ],
    });
    const tempPoint = vm.series.find((s) => s.metric === "temperature_c")
      ?.points[0];
    expect(tempPoint?.display).toBe("32.0°F");
    expect(vm.series.find((s) => s.metric === "temperature_c")?.unit).toBe(
      "°F",
    );
  });
});

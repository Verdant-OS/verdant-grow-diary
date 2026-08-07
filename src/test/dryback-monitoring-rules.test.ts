/**
 * Pure tests for read-only dryback monitoring.
 * Pins evidence-only math, quality gates, and ban on schedule/recommendation copy.
 */
import { describe, expect, it } from "vitest";
import {
  DRYBACK_MONITORING_CAVEAT,
  DRYBACK_EMPTY_NO_SAMPLES,
  DRYBACK_EMPTY_NO_WATERINGS,
  buildDrybackMonitoring,
  buildDrybackMonitoringFromSensorRows,
  classifyDrybackSource,
  extractDrybackVwcSamples,
  isPlausibleDrybackVwc,
} from "@/lib/drybackMonitoringRules";

const T0 = Date.parse("2026-08-06T18:00:00.000Z");

function hoursFrom(base: number, h: number): string {
  return new Date(base + h * 3600_000).toISOString();
}

describe("isPlausibleDrybackVwc", () => {
  it("rejects out of range and exact 0/100 extremes", () => {
    expect(isPlausibleDrybackVwc(45)).toBe(true);
    expect(isPlausibleDrybackVwc(0)).toBe(false);
    expect(isPlausibleDrybackVwc(100)).toBe(false);
    expect(isPlausibleDrybackVwc(-1)).toBe(false);
    expect(isPlausibleDrybackVwc(101)).toBe(false);
  });
});

describe("classifyDrybackSource", () => {
  it("maps known sources without inventing live", () => {
    expect(classifyDrybackSource("live")).toBe("live");
    expect(classifyDrybackSource("manual")).toBe("manual");
    expect(classifyDrybackSource("csv")).toBe("csv");
    expect(classifyDrybackSource("demo")).toBe("demo");
    expect(classifyDrybackSource("")).toBe("unknown");
  });
});

describe("extractDrybackVwcSamples", () => {
  it("keeps only soil moisture metrics", () => {
    const samples = extractDrybackVwcSamples([
      {
        id: "1",
        metric: "soil_moisture_pct",
        value: 42,
        source: "live",
        captured_at: hoursFrom(T0, 0),
      },
      {
        id: "2",
        metric: "temperature_c",
        value: 24,
        source: "live",
        captured_at: hoursFrom(T0, 0),
      },
      {
        id: "3",
        metric: "soil_moisture_pct",
        value: 0,
        source: "live",
        captured_at: hoursFrom(T0, 1),
      },
    ]);
    expect(samples).toHaveLength(2);
    expect(samples[0].vwcPct).toBe(42);
  });
});

describe("buildDrybackMonitoring", () => {
  it("returns empty when no samples", () => {
    const vm = buildDrybackMonitoring(
      [],
      [{ id: "w1", occurredAt: hoursFrom(T0, -24), volumeMl: 1000 }],
      { now: T0 },
    );
    expect(vm.status).toBe("empty");
    expect(vm.emptyCopy).toBe(DRYBACK_EMPTY_NO_SAMPLES);
  });

  it("returns empty when samples exist but no watering markers", () => {
    const vm = buildDrybackMonitoring(
      [
        {
          id: "s1",
          capturedAt: hoursFrom(T0, -2),
          vwcPct: 40,
          source: "live",
        },
      ],
      [],
      { now: T0 },
    );
    expect(vm.status).toBe("empty");
    expect(vm.emptyCopy).toBe(DRYBACK_EMPTY_NO_WATERINGS);
  });

  it("builds a closed usable window with peak→trough dryback", () => {
    const w0 = hoursFrom(T0, -48);
    const w1 = hoursFrom(T0, -12);
    const samples = [
      // after first watering: peak then dry down
      { id: "a", capturedAt: hoursFrom(T0, -47), vwcPct: 55, source: "live" },
      { id: "b", capturedAt: hoursFrom(T0, -40), vwcPct: 48, source: "live" },
      { id: "c", capturedAt: hoursFrom(T0, -30), vwcPct: 40, source: "live" },
      { id: "d", capturedAt: hoursFrom(T0, -20), vwcPct: 35, source: "live" },
      { id: "e", capturedAt: hoursFrom(T0, -13), vwcPct: 32, source: "live" },
      // after second watering (open)
      { id: "f", capturedAt: hoursFrom(T0, -10), vwcPct: 58, source: "live" },
      { id: "g", capturedAt: hoursFrom(T0, -4), vwcPct: 50, source: "live" },
      { id: "h", capturedAt: hoursFrom(T0, -1), vwcPct: 46, source: "live" },
    ];
    const vm = buildDrybackMonitoring(
      samples,
      [
        { id: "w0", occurredAt: w0, volumeMl: 1800 },
        { id: "w1", occurredAt: w1, volumeMl: 1600 },
      ],
      { now: T0 },
    );

    expect(vm.status).toBe("windows");
    expect(vm.latestClosed).not.toBeNull();
    expect(vm.latestClosed?.peakVwcPct).toBe(55);
    expect(vm.latestClosed?.troughVwcPct).toBe(32);
    expect(vm.latestClosed?.deltaPctPoints).toBe(23);
    expect(vm.latestClosed?.quality).toBe("usable");
    expect(vm.openWindow?.kind).toBe("open");
    expect(vm.usableWindowCount).toBeGreaterThanOrEqual(1);
    expect(vm.caveat).toBe(DRYBACK_MONITORING_CAVEAT);
  });

  it("marks demo windows weak and never invents recommendation language", () => {
    const w0 = hoursFrom(T0, -24);
    const w1 = hoursFrom(T0, -2);
    const samples = [
      { id: "a", capturedAt: hoursFrom(T0, -23), vwcPct: 60, source: "demo" },
      { id: "b", capturedAt: hoursFrom(T0, -18), vwcPct: 50, source: "demo" },
      { id: "c", capturedAt: hoursFrom(T0, -12), vwcPct: 40, source: "demo" },
      { id: "d", capturedAt: hoursFrom(T0, -3), vwcPct: 35, source: "demo" },
    ];
    const vm = buildDrybackMonitoring(
      samples,
      [
        { id: "w0", occurredAt: w0 },
        { id: "w1", occurredAt: w1 },
      ],
      { now: T0 },
    );
    expect(vm.latestClosed?.sourceClass).toBe("demo");
    expect(vm.latestClosed?.quality).toBe("weak");
    const blob = JSON.stringify(vm).toLowerCase();
    expect(blob).not.toMatch(/should water/);
    expect(blob).not.toMatch(/water now/);
    expect(blob).not.toMatch(/overdue/);
    expect(blob).not.toMatch(/watering schedule/);
    expect(vm.caveat).toMatch(/not a watering recommendation/i);
  });

  it("buildDrybackMonitoringFromSensorRows maps long-format rows", () => {
    const vm = buildDrybackMonitoringFromSensorRows(
      [
        {
          id: "r1",
          metric: "soil_moisture_pct",
          value: 50,
          source: "manual",
          captured_at: hoursFrom(T0, -5),
        },
        {
          id: "r2",
          metric: "soil_moisture_pct",
          value: 40,
          source: "manual",
          captured_at: hoursFrom(T0, -1),
        },
      ],
      [{ id: "w1", occurredAt: hoursFrom(T0, -10), volumeMl: 1000 }],
      { now: T0 },
    );
    expect(vm.sampleCount).toBe(2);
    expect(vm.openWindow?.sampleCount).toBe(2);
  });
});

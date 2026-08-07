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

describe("projectDrybackSamplesForMonitoring / calibrated series", () => {
  const GROW = "11111111-1111-4111-8111-111111111111";
  const TENT = "22222222-2222-4222-8222-222222222222";

  it("uses calibrated VWC for peak/trough when a dry/wet baseline is active", () => {
    const w0 = hoursFrom(T0, -48);
    const w1 = hoursFrom(T0, -12);
    // dry=0 wet=100 identity-ish but dry=10 wet=90 → map 55→50, 32→24.4 approx
    // Use dry=0 wet=100 for easy math: calibrated == raw when points 0 and 100...
    // dry=10, wet=90: cal(55)=(55-10)/80*100 = 56.25; cal(32)=(32-10)/80*100=27.5
    const vm = buildDrybackMonitoringFromSensorRows(
      [
        {
          id: "a",
          metric: "soil_moisture_pct",
          value: 55,
          source: "live",
          captured_at: hoursFrom(T0, -47),
        },
        {
          id: "b",
          metric: "soil_moisture_pct",
          value: 48,
          source: "live",
          captured_at: hoursFrom(T0, -40),
        },
        {
          id: "c",
          metric: "soil_moisture_pct",
          value: 40,
          source: "live",
          captured_at: hoursFrom(T0, -30),
        },
        {
          id: "d",
          metric: "soil_moisture_pct",
          value: 35,
          source: "live",
          captured_at: hoursFrom(T0, -20),
        },
        {
          id: "e",
          metric: "soil_moisture_pct",
          value: 32,
          source: "live",
          captured_at: hoursFrom(T0, -13),
        },
        {
          id: "f",
          metric: "soil_moisture_pct",
          value: 58,
          source: "live",
          captured_at: hoursFrom(T0, -10),
        },
        {
          id: "g",
          metric: "soil_moisture_pct",
          value: 50,
          source: "live",
          captured_at: hoursFrom(T0, -4),
        },
        {
          id: "h",
          metric: "soil_moisture_pct",
          value: 46,
          source: "live",
          captured_at: hoursFrom(T0, -1),
        },
      ],
      [
        { id: "w0", occurredAt: w0, volumeMl: 1800 },
        { id: "w1", occurredAt: w1, volumeMl: 1600 },
      ],
      {
        now: T0,
        calibration: {
          context: { growId: GROW, tentId: TENT, plantId: null, deviceId: null },
          calibrations: [
            {
              id: "cal-1",
              growId: GROW,
              tentId: TENT,
              plantId: null,
              deviceId: null,
              dryRaw: 10,
              wetRaw: 90,
              source: "manual",
              isActive: true,
              createdAt: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
      },
    );

    expect(vm.seriesValueKind).toBe("calibrated");
    expect(vm.seriesLabel.toLowerCase()).toMatch(/calibrated/);
    // peak raw 55 → 56.3; trough raw 32 → 27.5; delta 28.8
    expect(vm.latestClosed?.peakVwcPct).toBe(56.3);
    expect(vm.latestClosed?.troughVwcPct).toBe(27.5);
    expect(vm.latestClosed?.deltaPctPoints).toBe(28.8);
  });

  it("falls back to raw when no active baseline", () => {
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
      {
        now: T0,
        calibration: {
          context: { growId: GROW, tentId: TENT },
          calibrations: [],
        },
      },
    );
    expect(vm.seriesValueKind).toBe("raw");
    expect(vm.openWindow?.peakVwcPct).toBe(50);
    expect(vm.openWindow?.troughVwcPct).toBe(40);
  });
});

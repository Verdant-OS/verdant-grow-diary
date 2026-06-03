/**
 * Regression tests for SensorChart time-range filtering + tooltip
 * timestamp formatting. Locks in:
 *   - oldest → newest order for every filter range
 *   - deterministic order for equal timestamps
 *   - safe handling of invalid/missing timestamps
 *   - shared helpers wired into SensorChart (no inline duplicate logic)
 *   - tooltip timestamp formatter renders a human shape, never raw ISO
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterTimeSeriesByRange,
  formatChartTooltipTimestamp,
  SENSOR_CHART_TIME_RANGES,
} from "@/lib/sensorChartTimeRange";

const NOW = new Date("2026-06-03T12:00:00Z").getTime();
const day = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const FIXTURE = [
  { ts: day(120), v: 120 },
  { ts: day(60), v: 60 },
  { ts: day(20), v: 20 },
  { ts: day(5), v: 5 },
  { ts: day(1), v: 1 },
];

const isAsc = (xs: { ts: string }[]) =>
  xs.every((p, i) => i === 0 || new Date(xs[i - 1].ts).getTime() <= new Date(p.ts).getTime());

describe("filterTimeSeriesByRange", () => {
  it("exports the four expected ranges in order", () => {
    expect(SENSOR_CHART_TIME_RANGES.map((r) => r.value)).toEqual(["7d", "30d", "90d", "all"]);
  });

  it("7d preserves ascending order and drops older points", () => {
    const out = filterTimeSeriesByRange(FIXTURE, "7d", (p) => p.ts, NOW);
    expect(out.map((p) => p.v)).toEqual([5, 1]);
    expect(isAsc(out)).toBe(true);
  });

  it("30d preserves ascending order", () => {
    const out = filterTimeSeriesByRange(FIXTURE, "30d", (p) => p.ts, NOW);
    expect(out.map((p) => p.v)).toEqual([20, 5, 1]);
    expect(isAsc(out)).toBe(true);
  });

  it("90d preserves ascending order", () => {
    const out = filterTimeSeriesByRange(FIXTURE, "90d", (p) => p.ts, NOW);
    expect(out.map((p) => p.v)).toEqual([60, 20, 5, 1]);
    expect(isAsc(out)).toBe(true);
  });

  it("all preserves ascending order across full range", () => {
    const out = filterTimeSeriesByRange(FIXTURE, "all", (p) => p.ts, NOW);
    expect(out.map((p) => p.v)).toEqual([120, 60, 20, 5, 1]);
    expect(isAsc(out)).toBe(true);
  });

  it("re-sorts DESC input into ascending order regardless of range", () => {
    const desc = [...FIXTURE].reverse();
    for (const r of SENSOR_CHART_TIME_RANGES) {
      const out = filterTimeSeriesByRange(desc, r.value, (p) => p.ts, NOW);
      expect(isAsc(out)).toBe(true);
    }
  });

  it("preserves deterministic order for equal timestamps", () => {
    const t = day(2);
    const equal = [
      { ts: t, id: "a" },
      { ts: t, id: "b" },
      { ts: t, id: "c" },
    ];
    const out = filterTimeSeriesByRange(equal, "7d", (p) => p.ts, NOW);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("does not crash on invalid/missing timestamps and never reverses chronological order", () => {
    const mixed = [
      { ts: "not-a-date", id: "bad" },
      { ts: day(2), id: "newer" },
      { ts: null as unknown as string, id: "null" },
      { ts: day(6), id: "older" },
    ];
    const out = filterTimeSeriesByRange(mixed, "7d", (p) => p.ts, NOW);
    // Bounded ranges drop invalid timestamps so they cannot break the axis.
    expect(out.map((p) => p.id)).toEqual(["older", "newer"]);

    const all = filterTimeSeriesByRange(mixed, "all", (p) => p.ts, NOW);
    // "all" keeps everything, but valid points still come first in ASC order.
    expect(all.slice(0, 2).map((p) => p.id)).toEqual(["older", "newer"]);
  });

  it("returns [] for null/empty input", () => {
    expect(filterTimeSeriesByRange<{ ts: string }>(null, "7d", (p) => p.ts, NOW)).toEqual([]);
    expect(filterTimeSeriesByRange<{ ts: string }>([], "all", (p) => p.ts, NOW)).toEqual([]);
  });
});

describe("formatChartTooltipTimestamp", () => {
  it("renders a human-readable shape with month, day, year, and 12-hour time", () => {
    const out = formatChartTooltipTimestamp("2026-05-31T13:44:00Z");
    expect(out).toContain("2026");
    expect(out).toMatch(/\b\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)\b/);
    expect(out).not.toMatch(/T\d{2}:\d{2}/);
    expect(out).not.toMatch(/\+\d{2}:\d{2}/);
  });

  it("is null-safe and never throws", () => {
    expect(formatChartTooltipTimestamp(null)).toBe("Unknown time");
    expect(formatChartTooltipTimestamp(undefined)).toBe("Unknown time");
    expect(formatChartTooltipTimestamp("")).toBe("Unknown time");
    expect(formatChartTooltipTimestamp("not-a-date")).toBe("Unknown time");
  });

  it("accepts Date and numeric epochs", () => {
    expect(formatChartTooltipTimestamp(new Date("2026-05-31T13:44:00Z"))).toContain("2026");
    expect(formatChartTooltipTimestamp(1748699040000)).toMatch(/\d{4}/);
  });
});

describe("SensorChart wires shared time-range + tooltip helpers", () => {
  const SRC = readFileSync(
    resolve(__dirname, "..", "components", "SensorChart.tsx"),
    "utf8",
  );

  it("imports the shared range + tooltip helpers", () => {
    expect(SRC).toMatch(/from\s+["']@\/lib\/sensorChartTimeRange["']/);
    expect(SRC).toMatch(/filterTimeSeriesByRange\(/);
    expect(SRC).toMatch(/formatChartTooltipTimestamp/);
  });

  it("renders a range selector with 7d / 30d / 90d / All buttons", () => {
    expect(SRC).toMatch(/SENSOR_CHART_TIME_RANGES/);
    expect(SRC).toMatch(/role="radiogroup"/);
  });

  it("does not duplicate inline time-ordering logic (no inline .sort on data)", () => {
    // The chart must rely on the shared helper, not a local sort.
    expect(SRC).not.toMatch(/data\.sort\(/);
    expect(SRC).not.toMatch(/\.slice\(\)\.sort\(/);
  });
});

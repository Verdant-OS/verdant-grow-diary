/**
 * Regression tests: time-series charts must render oldest → newest.
 *
 * Covers:
 *   - the shared sortTimeSeriesAscending helper (pure, deterministic, safe)
 *   - SensorChart wires the helper so reversed input is re-sorted
 *   - tentSensorChartRules.buildTentSensorChartSeries also returns ascending
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sortTimeSeriesAscending } from "@/lib/sortTimeSeriesAscending";
import { buildTentSensorChartSeries } from "@/lib/tentSensorChartRules";

describe("sortTimeSeriesAscending", () => {
  

  it("returns [] for null/empty input", () => {
    expect(sortTimeSeriesAscending<{ ts: string }>(null, (p) => p.ts)).toEqual([]);
    expect(sortTimeSeriesAscending<{ ts: string }>(undefined, (p) => p.ts)).toEqual([]);
    expect(sortTimeSeriesAscending<{ ts: string }>([], (p) => p.ts)).toEqual([]);
  });

  it("sorts reversed (DESC) input into ascending order", () => {
    const desc = [
      { ts: "2025-01-03T00:00:00Z", v: 3 },
      { ts: "2025-01-02T00:00:00Z", v: 2 },
      { ts: "2025-01-01T00:00:00Z", v: 1 },
    ];
    expect(sortTimeSeriesAscending(desc, (p) => p.ts).map((p) => p.v)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { ts: "2025-01-03T00:00:00Z", v: 3 },
      { ts: "2025-01-01T00:00:00Z", v: 1 },
    ];
    const snapshot = [...input];
    sortTimeSeriesAscending(input, (p) => p.ts);
    expect(input).toEqual(snapshot);
  });

  it("preserves relative order for equal timestamps (stable)", () => {
    const equal = [
      { ts: "2025-01-01T00:00:00Z", id: "a" },
      { ts: "2025-01-01T00:00:00Z", id: "b" },
      { ts: "2025-01-01T00:00:00Z", id: "c" },
    ];
    expect(sortTimeSeriesAscending(equal, (p) => p.ts).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("pushes invalid/missing timestamps to the end without crashing", () => {
    const mixed = [
      { ts: "not-a-date", id: "bad" },
      { ts: "2025-01-02T00:00:00Z", id: "newer" },
      { ts: null as unknown as string, id: "null" },
      { ts: "2025-01-01T00:00:00Z", id: "older" },
    ];
    const out = sortTimeSeriesAscending(mixed, (p) => p.ts).map((p) => p.id);
    expect(out.slice(0, 2)).toEqual(["older", "newer"]);
    expect(out.slice(2).sort()).toEqual(["bad", "null"]);
  });

  it("accepts Date objects and numeric epochs", () => {
    const pts = [
      { when: new Date("2025-01-03T00:00:00Z"), id: "c" },
      { when: 1735689600000 /* 2025-01-01 */, id: "a" },
      { when: new Date("2025-01-02T00:00:00Z"), id: "b" },
    ];
    expect(
      sortTimeSeriesAscending(pts, (p) => p.when).map((p) => p.id),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("SensorChart wires the ascending sort helper", () => {
  const SRC = readFileSync(
    resolve(__dirname, "..", "components", "SensorChart.tsx"),
    "utf8",
  );
  it("imports and uses sortTimeSeriesAscending before mapping data", () => {
    expect(SRC).toMatch(/from\s+["']@\/lib\/sortTimeSeriesAscending["']/);
    expect(SRC).toMatch(/sortTimeSeriesAscending\(data/);
  });
});

describe("buildTentSensorChartSeries returns ascending order", () => {
  it("re-sorts reversed input into oldest → newest", () => {
    const desc = [
      { ts: "2025-01-03T00:00:00Z", metric: "temperature_c", value: 24, source: "live" },
      { ts: "2025-01-02T00:00:00Z", metric: "temperature_c", value: 23, source: "live" },
      { ts: "2025-01-01T00:00:00Z", metric: "temperature_c", value: 22, source: "live" },
    ];
    const out = buildTentSensorChartSeries(desc);
    expect(out.map((p) => p.ts)).toEqual([
      "2025-01-01T00:00:00Z",
      "2025-01-02T00:00:00Z",
      "2025-01-03T00:00:00Z",
    ]);
  });
});

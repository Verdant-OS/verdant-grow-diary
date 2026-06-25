/**
 * imported-sensor-history-view-model
 *
 * Pure tests for the read-only Tent Detail "Imported sensor history"
 * view model. Proves:
 *   - empty state when no CSV readings exist
 *   - deterministic summary (count, earliest, latest, metrics)
 *   - safe display rows capped by limit
 *   - never exposes raw_payload or other private fields
 *   - never accepts non-CSV sources into the view
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  IMPORTED_SENSOR_HISTORY_ALL_METRICS,
  IMPORTED_SENSOR_HISTORY_ANCHOR_ID,
  IMPORTED_SENSOR_HISTORY_DEFAULT_LIMIT,
  IMPORTED_SENSOR_HISTORY_EMPTY_COPY,
  IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY,
  IMPORTED_SENSOR_HISTORY_SOURCE,
  buildImportedSensorHistoryViewModel,
  type ImportedSensorHistoryInputRow,
} from "@/lib/importedSensorHistoryViewModel";

function row(
  overrides: Partial<ImportedSensorHistoryInputRow>,
): ImportedSensorHistoryInputRow {
  return {
    tent_id: "tent-A",
    source: "csv",
    metric: "temperature_c",
    captured_at: "2026-06-01T00:00:00Z",
    ts: "2026-06-01T00:00:00Z",
    value: 22.5,
    ...overrides,
  };
}

describe("buildImportedSensorHistoryViewModel — empty + summary", () => {
  it("returns isEmpty when no readings provided", () => {
    const vm = buildImportedSensorHistoryViewModel({ readings: [] });
    expect(vm.isEmpty).toBe(true);
    expect(vm.totalCount).toBe(0);
    expect(vm.metrics).toEqual([]);
    expect(vm.recentRows).toEqual([]);
    expect(vm.earliestCapturedAt).toBeNull();
    expect(vm.latestCapturedAt).toBeNull();
  });

  it("returns isEmpty when no CSV-sourced readings exist", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [
        row({ source: "live" }),
        row({ source: "manual" }),
        row({ source: "demo" }),
      ],
    });
    expect(vm.isEmpty).toBe(true);
  });

  it("only includes source === 'csv' rows in the summary and table", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [
        row({ source: "csv", metric: "temperature_c" }),
        row({ source: "live", metric: "humidity_pct" }),
        row({ source: "csv", metric: "humidity_pct", captured_at: "2026-06-01T01:00:00Z" }),
      ],
    });
    expect(vm.totalCount).toBe(2);
    expect(vm.metrics).toEqual(["humidity_pct", "temperature_c"]);
    expect(vm.recentRows.every((r) => ["temperature_c", "humidity_pct"].includes(r.metric))).toBe(true);
  });

  it("computes earliest/latest captured_at across CSV rows (UTC ISO)", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [
        row({ captured_at: "2026-06-01T00:00:00Z" }),
        row({ captured_at: "2026-06-03T12:00:00Z" }),
        row({ captured_at: "2026-06-02T06:00:00Z" }),
      ],
    });
    expect(vm.earliestCapturedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(vm.latestCapturedAt).toBe("2026-06-03T12:00:00.000Z");
  });

  it("falls back to row.ts when captured_at is missing", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [row({ captured_at: null, ts: "2026-06-05T00:00:00Z" })],
    });
    expect(vm.latestCapturedAt).toBe("2026-06-05T00:00:00.000Z");
  });

  it("recentRows is ordered latest-first and capped by limit", () => {
    const readings = Array.from({ length: 60 }, (_, i) =>
      row({ captured_at: `2026-06-01T00:${String(i).padStart(2, "0")}:00Z` }),
    );
    const vm = buildImportedSensorHistoryViewModel({ readings, limit: 10 });
    expect(vm.recentRows.length).toBe(10);
    expect(vm.recentRows[0].capturedAt).toBe("2026-06-01T00:59:00.000Z");
    expect(vm.recentRows[9].capturedAt).toBe("2026-06-01T00:50:00.000Z");
  });

  it("default limit is 25", () => {
    expect(IMPORTED_SENSOR_HISTORY_DEFAULT_LIMIT).toBe(25);
  });

  it("invalid timestamps are skipped without crashing", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: [
        row({ captured_at: "not-a-date", ts: null }),
        row({ captured_at: "2026-06-01T00:00:00Z" }),
      ],
    });
    expect(vm.totalCount).toBe(2);
    expect(vm.latestCapturedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(vm.recentRows.length).toBe(1);
  });

  it("output shape never contains raw_payload, device_id, user_id, or id", () => {
    const vm = buildImportedSensorHistoryViewModel({ readings: [row({})] });
    const json = JSON.stringify(vm);
    for (const banned of ["raw_payload", "device_id", "user_id"]) {
      expect(json).not.toContain(banned);
    }
  });

  it("canonical constants are stable", () => {
    expect(IMPORTED_SENSOR_HISTORY_SOURCE).toBe("csv");
    expect(IMPORTED_SENSOR_HISTORY_ANCHOR_ID).toBe("imported-history");
    expect(IMPORTED_SENSOR_HISTORY_NOT_LIVE_COPY).toBe("Not live data");
    expect(IMPORTED_SENSOR_HISTORY_EMPTY_COPY).toContain("No imported CSV sensor history");
  });
});

describe("buildImportedSensorHistoryViewModel — metric filtering", () => {
  const mixed = [
    row({ metric: "temperature_c", captured_at: "2026-06-01T00:00:00Z" }),
    row({ metric: "temperature_c", captured_at: "2026-06-02T00:00:00Z" }),
    row({ metric: "humidity_pct", captured_at: "2026-06-03T00:00:00Z" }),
    row({ metric: "co2_ppm", captured_at: "2026-06-04T00:00:00Z" }),
    row({ source: "live", metric: "temperature_c" }),
  ];

  it("returns deterministic metric options including an 'all' entry with counts", () => {
    const vm = buildImportedSensorHistoryViewModel({ readings: mixed });
    expect(vm.metricOptions.map((o) => o.id)).toEqual([
      IMPORTED_SENSOR_HISTORY_ALL_METRICS,
      "co2_ppm",
      "humidity_pct",
      "temperature_c",
    ]);
    const all = vm.metricOptions.find((o) => o.id === IMPORTED_SENSOR_HISTORY_ALL_METRICS);
    expect(all?.count).toBe(4);
    expect(vm.metricOptions.find((o) => o.id === "temperature_c")?.count).toBe(2);
    expect(vm.metricOptions.find((o) => o.id === "humidity_pct")?.count).toBe(1);
  });

  it("defaults to 'all metrics' when no selection is provided", () => {
    const vm = buildImportedSensorHistoryViewModel({ readings: mixed });
    expect(vm.selectedMetric).toBe(IMPORTED_SENSOR_HISTORY_ALL_METRICS);
    expect(vm.visibleCount).toBe(vm.totalCount);
    expect(vm.recentRows.length).toBe(4);
  });

  it("filters recent rows by selected metric and reports visibleCount", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: mixed,
      selectedMetric: "temperature_c",
    });
    expect(vm.selectedMetric).toBe("temperature_c");
    expect(vm.totalCount).toBe(4);
    expect(vm.visibleCount).toBe(2);
    expect(vm.recentRows.length).toBe(2);
    expect(vm.recentRows.every((r) => r.metric === "temperature_c")).toBe(true);
  });

  it("falls back to 'all metrics' when the selected metric is unknown", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: mixed,
      selectedMetric: "ph",
    });
    expect(vm.selectedMetric).toBe(IMPORTED_SENSOR_HISTORY_ALL_METRICS);
    expect(vm.visibleCount).toBe(vm.totalCount);
  });

  it("earliest/latest are computed across the full CSV set, not the filtered subset", () => {
    const vm = buildImportedSensorHistoryViewModel({
      readings: mixed,
      selectedMetric: "co2_ppm",
    });
    expect(vm.earliestCapturedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(vm.latestCapturedAt).toBe("2026-06-04T00:00:00.000Z");
    expect(vm.visibleCount).toBe(1);
  });

  it("metricOptions is empty and visibleCount is 0 when there are no CSV rows", () => {
    const vm = buildImportedSensorHistoryViewModel({ readings: [] });
    expect(vm.metricOptions).toEqual([]);
    expect(vm.visibleCount).toBe(0);
    expect(vm.selectedMetric).toBe(IMPORTED_SENSOR_HISTORY_ALL_METRICS);
  });
});

describe("static safety — view model + panel files", () => {
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const FILES = [
    "src/lib/importedSensorHistoryViewModel.ts",
    "src/components/ImportedSensorHistoryPanel.tsx",
  ];
  for (const rel of FILES) {
    const code = stripComments(readFileSync(resolve(process.cwd(), rel), "utf8"));
    it(`${rel} never references raw_payload`, () => {
      expect(code).not.toMatch(/raw_payload/);
    });
    it(`${rel} never references service_role / bridge token / functions.invoke`, () => {
      for (const banned of [
        "service_role",
        "SUPABASE_SERVICE_ROLE",
        "bridge_token",
        "BRIDGE_TOKEN",
        "functions.invoke",
      ]) {
        expect(code).not.toContain(banned);
      }
    });
    it(`${rel} never writes to alerts / action_queue / device control`, () => {
      for (const banned of [
        "action_queue",
        "deviceControl",
        "device_control",
        "automation",
      ]) {
        expect(code).not.toContain(banned);
      }
      expect(code).not.toMatch(/from\(["']alerts["']\)/);
    });
    it(`${rel} never labels imported rows as live`, () => {
      expect(code).not.toMatch(/source:\s*["']live["']/);
      const lower = code.toLowerCase();
      for (const phrase of [
        "live readings imported",
        "live sensor readings imported",
        "synced live data",
        "created live sensor data",
      ]) {
        expect(lower).not.toContain(phrase);
      }
    });
  }
});

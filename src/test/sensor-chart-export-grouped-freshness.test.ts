/**
 * Chart export freshness for grouped readings.
 *
 * A grouped reading takes its least-trusted source as `source`, so a live row
 * and a manual row captured at the same instant export as `manual`. Aging that
 * row by the source alone applies the 24-hour manual window while its live
 * component is already stale after 15 minutes. Dashboard and Tent Detail pass
 * fetch-time readings straight to the chart, so the export must recompute the
 * status from the retained freshness inputs before writing the Status column.
 */
import { describe, expect, it } from "vitest";
import type { SensorReadingRow } from "@/lib/db";
import { groupSensorReadingRows } from "@/lib/growAdapters";
import { buildSensorReadingsCsv } from "@/lib/sensorChartExport";

const FETCHED_AT = Date.parse("2026-09-24T12:00:00.000Z");
const MIN = 60_000;
const CAPTURED_AT = new Date(FETCHED_AT - MIN).toISOString();

function row(
  source: string,
  metric: string,
  value: number,
  overrides: Partial<SensorReadingRow> = {},
): SensorReadingRow {
  return {
    id: `${source}-${metric}`,
    user_id: "owner-a",
    tent_id: "tent-a",
    source,
    metric,
    value,
    quality: "ok",
    ts: CAPTURED_AT,
    captured_at: CAPTURED_AT,
    created_at: new Date(FETCHED_AT).toISOString(),
    device_id: null,
    raw_payload: null,
    ...overrides,
  } as SensorReadingRow;
}

function statusColumn(csv: string): string[] {
  return csv
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[8]);
}

function mixedGroup(quality = "ok") {
  return groupSensorReadingRows(
    [row("live", "temperature_c", 25, { quality }), row("manual", "humidity_pct", 55)],
    new Date(FETCHED_AT),
  );
}

describe("buildSensorReadingsCsv — grouped live + manual readings", () => {
  it("fixture: the group reports manual provenance and is usable at fetch time", () => {
    const [grouped] = mixedGroup();
    expect(grouped.source).toBe("manual");
    expect(grouped.status).toBe("usable");
  });

  it("stays usable at the exact live boundary", () => {
    // Captured one minute before fetch, so the 15-minute live window ends 14 minutes later.
    expect(statusColumn(buildSensorReadingsCsv(mixedGroup(), FETCHED_AT + 14 * MIN))).toEqual([
      "usable",
    ]);
  });

  it("exports stale once the live component passes its window", () => {
    expect(statusColumn(buildSensorReadingsCsv(mixedGroup(), FETCHED_AT + 16 * MIN))).toEqual([
      "stale",
    ]);
  });

  it("preserves values, provenance and capture time while aging", () => {
    const [line] = buildSensorReadingsCsv(mixedGroup(), FETCHED_AT + 16 * MIN)
      .split("\n")
      .slice(1);
    expect(line).toContain(",25,55,");
    expect(line).toContain(",manual,stale,");
  });

  it("never promotes an explicitly invalid component", () => {
    const [grouped] = mixedGroup("invalid");
    expect(grouped.status).toBe("invalid");
    for (const offset of [0, 16 * MIN, 48 * 60 * MIN]) {
      expect(
        statusColumn(buildSensorReadingsCsv(mixedGroup("invalid"), FETCHED_AT + offset)),
      ).toEqual(["invalid"]);
    }
  });

  it("leaves the supplied status alone when no export clock is given", () => {
    expect(statusColumn(buildSensorReadingsCsv(mixedGroup()))).toEqual(["usable"]);
  });
});

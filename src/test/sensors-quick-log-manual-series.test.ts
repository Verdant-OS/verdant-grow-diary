/**
 * Sensors series must include recent Quick Log manuals (VGD-SENSORS-QL-MANUALS-001).
 *
 * KEEP identity (Soft, Veg Tent A / Skunk Gas Veg B): QL manuals exist on
 * Timeline while Sensors lagged on older sensor_readings. This pins the
 * read-side join, not Timeline stale-manual exclusion (#1332/#1333).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import { filterTimeSeriesByRange } from "@/lib/sensorChartTimeRange";
import {
  readObservedSensorMetric,
  selectLatestSensorReading,
} from "@/lib/sensorReadingSelectionRules";
import type { SensorReading } from "@/mock";
import {
  collectSensorsQuickLogManualReadings,
  mergeSensorsSeriesWithQuickLogManuals,
  sensorReadingFromQuickLogDiaryManual,
  sensorReadingFromQuickLogEnvironmentRow,
} from "@/lib/sensorsQuickLogManualSeriesRules";
import type { QuickLogV2EnvironmentRow } from "@/lib/quickLogV2ManualSnapshotAdapter";
import type { RawGrowEventRow } from "@/lib/quickLogGroupedTimelineRowAdapter";

const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-09-11T20:00:00.000Z");
const SEP_11 = "2026-09-11T16:30:00.000Z";
const SEP_10_EVENING = "2026-09-10T23:15:00.000Z";

function liveRow(overrides: Partial<SensorReading>): SensorReading {
  return {
    ts: SEP_10_EVENING,
    tentId: TENT_A,
    temp: 25.5,
    rh: 62,
    vpd: 0.95,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh", "vpd"],
    source: "live",
    status: "stale",
    capturedAt: SEP_10_EVENING,
    ...overrides,
  };
}

describe("sensorReadingFromQuickLogEnvironmentRow", () => {
  it("maps Veg Tent A QL identity 81.3°F / 67.8% / 1.17 kPa with Sep 11 timestamp", () => {
    const row: QuickLogV2EnvironmentRow = {
      id: "ge-veg-a",
      plant_id: null,
      tent_id: TENT_A,
      occurred_at: SEP_11,
      event_type: "environment",
      source: "manual",
      environment: {
        temperature_c: fahrenheitToCelsius(81.3),
        humidity_pct: 67.8,
        vpd_kpa: 1.17,
      },
    };
    const reading = sensorReadingFromQuickLogEnvironmentRow(row, NOW);
    expect(reading).not.toBeNull();
    expect(reading?.source).toBe("manual");
    expect(reading?.ts).toBe(SEP_11);
    expect(reading?.capturedAt).toBe(SEP_11);
    expect(readObservedSensorMetric(reading, "temp")).toBeCloseTo(fahrenheitToCelsius(81.3), 5);
    expect(readObservedSensorMetric(reading, "rh")).toBe(67.8);
    expect(readObservedSensorMetric(reading, "vpd")).toBe(1.17);
    expect(reading?.status).toBe("usable");
  });

  it("rejects live/csv/demo environment rows and empty telemetry", () => {
    const base: QuickLogV2EnvironmentRow = {
      id: "ge-bad",
      plant_id: null,
      tent_id: TENT_A,
      occurred_at: SEP_11,
      event_type: "environment",
      source: "live",
      environment: { temperature_c: 25, humidity_pct: 60, vpd_kpa: 1 },
    };
    expect(sensorReadingFromQuickLogEnvironmentRow(base, NOW)).toBeNull();
    expect(
      sensorReadingFromQuickLogEnvironmentRow(
        {
          ...base,
          source: "manual",
          environment: { temperature_c: null, humidity_pct: null, vpd_kpa: null },
        },
        NOW,
      ),
    ).toBeNull();
  });
});

describe("sensorReadingFromQuickLogDiaryManual", () => {
  it("maps details.manual_sensor_snapshot temp_f / RH onto canonical Celsius", () => {
    const reading = sensorReadingFromQuickLogDiaryManual(
      {
        id: "diary-1",
        tent_id: TENT_A,
        entry_at: SEP_11,
        details: {
          manual_sensor_snapshot: { source: "manual", temp_f: 81.3, humidity_percent: 67.8 },
        },
      },
      TENT_A,
      NOW,
    );
    expect(reading).not.toBeNull();
    expect(readObservedSensorMetric(reading, "temp")).toBeCloseTo(fahrenheitToCelsius(81.3), 5);
    expect(readObservedSensorMetric(reading, "rh")).toBe(67.8);
    expect(reading?.capturedAt).toBe(SEP_11);
  });

  it("fails closed on foreign tent_id and unlabeled snapshots", () => {
    expect(
      sensorReadingFromQuickLogDiaryManual(
        {
          tent_id: TENT_B,
          entry_at: SEP_11,
          details: { manual_sensor_snapshot: { source: "manual", temp_f: 81.3 } },
        },
        TENT_A,
        NOW,
      ),
    ).toBeNull();
    expect(
      sensorReadingFromQuickLogDiaryManual(
        {
          tent_id: TENT_A,
          entry_at: SEP_11,
          details: { manual_sensor_snapshot: { temp_f: 81.3, humidity_percent: 67.8 } },
        },
        TENT_A,
        NOW,
      ),
    ).toBeNull();
  });
});

describe("mergeSensorsSeriesWithQuickLogManuals", () => {
  it("surfaces the Sep 11 QL row as latest while keeping the Sep 10 live row", () => {
    const older = liveRow({ tentId: TENT_A, temp: 25.5, rh: 62, vpd: 0.95 });
    const ql = sensorReadingFromQuickLogEnvironmentRow(
      {
        id: "ge-veg-a",
        plant_id: null,
        tent_id: TENT_A,
        occurred_at: SEP_11,
        event_type: "environment",
        source: "manual",
        environment: {
          temperature_c: fahrenheitToCelsius(81.3),
          humidity_pct: 67.8,
          vpd_kpa: 1.17,
        },
      },
      NOW,
    );
    const merged = mergeSensorsSeriesWithQuickLogManuals([older], ql ? [ql] : []);
    expect(merged).toHaveLength(2);
    const latest = selectLatestSensorReading(merged);
    expect(latest?.source).toBe("manual");
    expect(latest?.capturedAt).toBe(SEP_11);
    expect(readObservedSensorMetric(latest, "temp")).toBeCloseTo(fahrenheitToCelsius(81.3), 5);
    expect(readObservedSensorMetric(latest, "rh")).toBe(67.8);
    expect(readObservedSensorMetric(latest, "vpd")).toBe(1.17);
    expect(merged.some((row) => row.capturedAt === SEP_10_EVENING && row.source === "live")).toBe(
      true,
    );
    const inSevenDays = filterTimeSeriesByRange(
      merged,
      "7d",
      (row) => row.capturedAt,
      NOW.getTime(),
    );
    expect(inSevenDays.some((row) => row.capturedAt === SEP_11)).toBe(true);
  });

  it("keeps Skunk Gas Veg B Sep 10 70.5/68/0.83 listed beside Sep 11 QL 77.9/68.2/1.04", () => {
    const older = liveRow({
      tentId: TENT_B,
      temp: fahrenheitToCelsius(70.5),
      rh: 68,
      vpd: 0.83,
    });
    const ql = sensorReadingFromQuickLogEnvironmentRow(
      {
        id: "ge-veg-b",
        plant_id: null,
        tent_id: TENT_B,
        occurred_at: SEP_11,
        event_type: "environment",
        source: "manual",
        environment: {
          temperature_c: fahrenheitToCelsius(77.9),
          humidity_pct: 68.2,
          vpd_kpa: 1.04,
        },
      },
      NOW,
    );
    const merged = mergeSensorsSeriesWithQuickLogManuals([older], ql ? [ql] : []);
    expect(merged).toHaveLength(2);
    expect(readObservedSensorMetric(selectLatestSensorReading(merged), "temp")).toBeCloseTo(
      fahrenheitToCelsius(77.9),
      5,
    );
    expect(readObservedSensorMetric(selectLatestSensorReading(merged), "rh")).toBe(68.2);
    expect(readObservedSensorMetric(selectLatestSensorReading(merged), "vpd")).toBe(1.04);
    expect(
      merged.some(
        (row) =>
          row.capturedAt === SEP_10_EVENING &&
          readObservedSensorMetric(row, "rh") === 68 &&
          readObservedSensorMetric(row, "vpd") === 0.83,
      ),
    ).toBe(true);
  });

  it("lists Flower Sep 10 Sensors 74.3/51 and the logged 73.4/52.9 as distinct points", () => {
    const sensorsRow = liveRow({
      temp: fahrenheitToCelsius(74.3),
      rh: 51,
      vpd: 0,
      observedMetrics: ["temp", "rh"],
      capturedAt: "2026-09-10T22:00:00.000Z",
      ts: "2026-09-10T22:00:00.000Z",
    });
    const logged = sensorReadingFromQuickLogEnvironmentRow(
      {
        id: "ge-flower",
        plant_id: null,
        tent_id: TENT_A,
        occurred_at: "2026-09-10T23:40:00.000Z",
        event_type: "environment",
        source: "manual",
        environment: {
          temperature_c: fahrenheitToCelsius(73.4),
          humidity_pct: 52.9,
          vpd_kpa: null,
        },
      },
      NOW,
    );
    const merged = mergeSensorsSeriesWithQuickLogManuals([sensorsRow], logged ? [logged] : []);
    expect(merged).toHaveLength(2);
    expect(readObservedSensorMetric(selectLatestSensorReading(merged), "temp")).toBeCloseTo(
      fahrenheitToCelsius(73.4),
      5,
    );
    expect(readObservedSensorMetric(selectLatestSensorReading(merged), "rh")).toBe(52.9);
  });
});

describe("collectSensorsQuickLogManualReadings", () => {
  it("scopes grow_events to the selected tent and ignores other tents", () => {
    const growEvents: RawGrowEventRow[] = [
      {
        id: "mine",
        plant_id: null,
        tent_id: TENT_A,
        occurred_at: SEP_11,
        event_type: "environment",
        source: "manual",
        note: null,
        is_deleted: false,
        environment_events: {
          temperature_c: fahrenheitToCelsius(81.3),
          humidity_pct: 67.8,
          vpd_kpa: 1.17,
        },
      },
      {
        id: "theirs",
        plant_id: null,
        tent_id: TENT_B,
        occurred_at: SEP_11,
        event_type: "environment",
        source: "manual",
        note: null,
        is_deleted: false,
        environment_events: {
          temperature_c: 30,
          humidity_pct: 40,
          vpd_kpa: 2,
        },
      },
    ];
    const collected = collectSensorsQuickLogManualReadings({
      tentId: TENT_A,
      growEvents,
      now: NOW,
    });
    expect(collected).toHaveLength(1);
    expect(collected[0]?.tentId).toBe(TENT_A);
    expect(readObservedSensorMetric(collected[0], "vpd")).toBe(1.17);
  });

  it("returns [] for missing tent or empty inputs", () => {
    expect(collectSensorsQuickLogManualReadings({ tentId: null, now: NOW })).toEqual([]);
    expect(collectSensorsQuickLogManualReadings({ tentId: TENT_A, now: NOW })).toEqual([]);
  });
});

describe("Sensors page wiring (source contract)", () => {
  const page = readFileSync(resolve(__dirname, "../pages/Sensors.tsx"), "utf8");
  const hook = readFileSync(
    resolve(__dirname, "../hooks/useSensorsQuickLogManualReadings.ts"),
    "utf8",
  );

  it("merges Quick Log manuals into the grower-facing Sensors series", () => {
    expect(page).toContain("useSensorsQuickLogManualReadings");
    expect(page).toContain("mergeSensorsSeriesWithQuickLogManuals");
  });

  it("refreshes from the grow_events Quick Log invalidation prefix", () => {
    expect(hook).toContain('SENSORS_QL_MANUAL_READINGS_QUERY_PREFIX = "grow_events"');
    expect(hook).toContain("sensors-ql-manuals");
    expect(hook).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
  });
});

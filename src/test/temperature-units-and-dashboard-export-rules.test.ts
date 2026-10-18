/**
 * Unit coverage for PR #2195 / issues #2155, #2156, #2160 — temperature unit
 * preference on pure rules and Dashboard chart merge helpers. Complements the
 * integration suite in qa-2155-2156-2160-temperature-units-and-csv-export.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import { buildSensorReadingsCsv } from "@/lib/sensorChartExport";
import { buildManualSnapshotChangeContext } from "@/lib/manualSensorSnapshotChangeContextRules";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";
import {
  formatTimelineManualSensorReceiptForUnit,
  manualSensorReadingsToTimelineEntries,
} from "@/lib/timelineManualSensorMeasurementRules";
import {
  mergeDashboardChartReadingsWithQuickLogManuals,
  mergeSensorsSeriesWithQuickLogManuals,
  sensorReadingFromQuickLogDiaryManual,
} from "@/lib/sensorsQuickLogManualSeriesRules";
import {
  buildTimelineCardSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
} from "@/lib/timelineSensorSnapshotViewModel";
import { readObservedSensorMetric } from "@/lib/sensorReadingSelectionRules";
import type { SensorReading } from "@/mock";
import type { SensorReadingRow } from "@/lib/db";

const TENT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-15T12:05:00.000Z");
const SEP_10 = "2026-09-10T22:00:00.000Z";
const SEP_11 = "2026-09-11T16:30:00.000Z";

function metricRow(
  metric: string,
  value: number,
  overrides: Partial<SensorReadingRow> = {},
): SensorReadingRow {
  return {
    id: `row-${metric}`,
    tent_id: TENT,
    metric,
    value,
    source: "manual",
    ts: "2026-10-15T12:00:00.000Z",
    captured_at: "2026-10-15T12:00:00.000Z",
    quality: "ok",
    raw_payload: null,
    user_id: "u",
    created_at: "2026-10-15T12:00:00.000Z",
    device_id: null,
    ...overrides,
  } as SensorReadingRow;
}

describe("buildSensorReadingsCsv — explicit temperature unit (#2155)", () => {
  const reading: SensorReading = {
    ts: "2026-06-01T12:00:00.000Z",
    tentId: "t1",
    temp: 24.5,
    rh: 55,
    vpd: 1.23,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh", "vpd"],
    source: "manual",
    status: "usable",
    capturedAt: "2026-06-01T12:00:00.000Z",
  };

  it("exports °F header and converted values when unit is fahrenheit or legacy F", () => {
    const csv = buildSensorReadingsCsv([reading], undefined, "fahrenheit");
    expect(csv.split("\n")[0]).toContain("Temperature (°F)");
    expect(csv.split("\n")[1].split(",")[1]).toBe("76.1");

    const legacy = buildSensorReadingsCsv([reading], undefined, "F");
    expect(legacy.split("\n")[0]).toContain("Temperature (°F)");
  });
});

describe("buildManualSnapshotChangeContext — celsius deltas (#2160)", () => {
  it("formats temperature delta in °C when temperatureUnit is celsius", () => {
    const r = buildManualSnapshotChangeContext({
      previous: {
        ts: "2026-05-24T09:00:00Z",
        metrics: { temperature_c: 24 },
      },
      latest: {
        ts: "2026-05-24T15:00:00Z",
        metrics: { temperature_c: 25 },
      },
      temperatureUnit: "celsius",
    });
    const temp = r.deltas.find((d) => d.key === "temperature_c");
    expect(temp?.formatted).toBe("+1.0°C");
    expect(temp?.formatted).not.toContain("°F");
  });
});

describe("buildManualSnapshotHistoryList — celsius chips (#2160)", () => {
  it("formats history metric chips and deltas in °C", () => {
    const rows: SensorReadingRow[] = [
      metricRow("temperature_c", 23.89, {
        ts: "2026-05-19T09:00:00Z",
        captured_at: "2026-05-19T09:00:00Z",
      }),
      metricRow("temperature_c", 23.33, {
        ts: "2026-05-20T09:00:00Z",
        captured_at: "2026-05-20T09:00:00Z",
      }),
    ];
    const [latest] = buildManualSnapshotHistoryList(rows, {
      tentId: TENT,
      temperatureUnit: "celsius",
    });
    expect(latest.metrics[0]?.formatted).toBe("23.3°C");
    const tempDelta = latest.deltas.find((d) => d.key === "temperature_c");
    expect(tempDelta?.formatted).toBe("-0.6°C");
  });
});

describe("Timeline manual sensor receipts — unit formatting (#2160)", () => {
  it("manualSensorReadingsToTimelineEntries honors celsius in options", () => {
    const [receipt] = manualSensorReadingsToTimelineEntries(
      [metricRow("temperature_c", 23.33), metricRow("humidity_pct", 58)],
      NOW,
      { temperatureUnit: "celsius" },
    );
    expect(receipt?.note).toContain("23.3°C");
    expect(receipt?.note).not.toContain("°F");
  });

  it("formatTimelineManualSensorReceiptForUnit rewrites note only", () => {
    const tempC = fahrenheitToCelsius(74);
    const [receipt] = manualSensorReadingsToTimelineEntries(
      [metricRow("temperature_c", tempC), metricRow("humidity_pct", 55)],
      NOW,
    );
    expect(receipt?.note).toContain("74°F");

    const celsius = formatTimelineManualSensorReceiptForUnit(receipt, "celsius");
    expect(celsius.note).toContain("23.3°C");
    expect(celsius.details).toEqual(receipt.details);

    expect(formatTimelineManualSensorReceiptForUnit(receipt, "fahrenheit")).toBe(receipt);
  });
});

describe("buildTimelineCardSensorSnapshotViewModel — celsius preference (#2160)", () => {
  it("shows °C chip from temp_f when temperatureUnit is celsius", () => {
    const resolution = resolveTimelineCardSensorResolution({
      manual_sensor_snapshot: { source: "manual", ts: "2026-10-15T12:00:00.000Z", temp_f: 74 },
    });
    const vm = buildTimelineCardSensorSnapshotViewModel(resolution, {
      temperatureUnit: "celsius",
    });
    expect(vm.sensorViewModel.kind).toBe("chips");
    if (vm.sensorViewModel.kind === "chips") {
      expect(vm.sensorViewModel.chips[0]?.display).toBe("23.3°C");
      expect(vm.sensorViewModel.chips[0]?.unit).toBe("°C");
    }
  });
});

describe("sensorsQuickLogManualSeriesRules — Dashboard merge (#2156)", () => {
  it("sensorReadingFromQuickLogDiaryManual accepts environment_check envelope", () => {
    const reading = sensorReadingFromQuickLogDiaryManual(
      {
        id: "diary-env",
        tent_id: TENT,
        entry_at: SEP_11,
        details: {
          environment_check: {
            temp_c: fahrenheitToCelsius(77.9),
            humidity_pct: 68.2,
            vpd_kpa: 1.04,
          },
        },
      },
      TENT,
      NOW,
    );
    expect(reading).not.toBeNull();
    expect(readObservedSensorMetric(reading, "temp")).toBeCloseTo(fahrenheitToCelsius(77.9), 5);
    expect(readObservedSensorMetric(reading, "rh")).toBe(68.2);
  });

  it("mergeCollidingManual infers observedMetrics when existing row omits them", () => {
    const capturedAt = SEP_11;
    const sensorRow: SensorReading = {
      ts: capturedAt,
      capturedAt,
      tentId: TENT,
      temp: 25,
      rh: 60,
      vpd: 1,
      co2: 0,
      soil: 0,
      source: "manual",
      status: "usable",
    };
    const qlRow: SensorReading = {
      ts: capturedAt,
      capturedAt,
      tentId: TENT,
      temp: 26,
      rh: 61,
      vpd: 1.1,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp", "rh", "vpd"],
      source: "manual",
      status: "usable",
    };
    const [merged] = mergeSensorsSeriesWithQuickLogManuals([sensorRow], [qlRow]);
    expect(merged.observedMetrics).toEqual(expect.arrayContaining(["temp", "rh", "vpd"]));
    expect(readObservedSensorMetric(merged, "temp")).toBe(26);
  });

  it("mergeDashboardChartReadingsWithQuickLogManuals orders oldest → newest", () => {
    const older: SensorReading = {
      ts: SEP_10,
      capturedAt: SEP_10,
      tentId: TENT,
      temp: 25,
      rh: 62,
      vpd: 0.95,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp", "rh", "vpd"],
      source: "live",
      status: "stale",
    };
    const newer: SensorReading = {
      ts: SEP_11,
      capturedAt: SEP_11,
      tentId: TENT,
      temp: fahrenheitToCelsius(81.3),
      rh: 67.8,
      vpd: 1.17,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp", "rh", "vpd"],
      source: "manual",
      status: "usable",
    };
    const chart = mergeDashboardChartReadingsWithQuickLogManuals([older], [newer]);
    expect(chart).toHaveLength(2);
    expect(chart[0]?.capturedAt).toBe(SEP_10);
    expect(chart[1]?.capturedAt).toBe(SEP_11);
  });
});

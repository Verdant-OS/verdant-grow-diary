/**
 * Pins the Grow Timeline Measurements receipt path for tent Manual
 * Sensor Snapshots that persist only as `sensor_readings` (source=manual).
 *
 * Does not invent live metrics. Rows are insert-equivalent fixtures.
 */
import { describe, expect, it } from "vitest";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import {
  diaryEntryHasMeasurementEvidence,
  isTimelineSensorDerivedDiaryId,
  manualSensorReadingsToTimelineEntries,
  mergeTimelineMeasurementDisplayEntries,
  TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX,
} from "@/lib/timelineManualSensorMeasurementRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const CAPTURED = "2026-09-09T18:46:00.000Z";
const NOW = new Date("2026-09-09T20:00:00.000Z");

function metricRow(metric: string, value: number, source = "manual") {
  return {
    tent_id: TENT,
    metric,
    value,
    source,
    ts: CAPTURED,
    captured_at: CAPTURED,
    quality: "ok",
  };
}

describe("manualSensorReadingsToTimelineEntries", () => {
  it("includes a grouped manual temp+RH snapshot in the Measurements query/view", () => {
    const tempC = fahrenheitToCelsius(76);
    const rows = [metricRow("temperature_c", tempC), metricRow("humidity_pct", 58)];
    const receipts = manualSensorReadingsToTimelineEntries(rows, NOW);
    const measurements = receipts.filter((entry) => diaryEntryHasMeasurementEvidence(entry));

    expect(measurements).toHaveLength(1);
    const receipt = measurements[0];
    expect(receipt.entry_at).toBe(CAPTURED);
    expect(receipt.tent_id).toBe(TENT);
    expect(receipt.details.event_type).toBe("measurement");
    expect(receipt.details.manual_sensor_snapshot).toMatchObject({
      source: "manual",
      humidity_percent: 58,
    });
    const snap = receipt.details.manual_sensor_snapshot as { temp_f: number };
    expect(snap.temp_f).toBeCloseTo(76, 5);
    expect(receipt.note).toContain("76");
    expect(receipt.note).toContain("58% RH");
    expect(isTimelineSensorDerivedDiaryId(receipt.id)).toBe(true);
    expect(receipt.id.startsWith(TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX)).toBe(true);
  });

  it("excludes live/csv/demo rows so Sensors live data is not a Timeline measurement receipt", () => {
    const tempC = fahrenheitToCelsius(74);
    const rows = [
      { ...metricRow("temperature_c", tempC), source: "live" },
      { ...metricRow("humidity_pct", 55), source: "live" },
      { ...metricRow("temperature_c", tempC), source: "csv" },
    ];
    expect(manualSensorReadingsToTimelineEntries(rows, NOW)).toEqual([]);
  });

  it("returns [] for null, empty, and metric-less groups", () => {
    expect(manualSensorReadingsToTimelineEntries(null, NOW)).toEqual([]);
    expect(manualSensorReadingsToTimelineEntries([], NOW)).toEqual([]);
    expect(
      manualSensorReadingsToTimelineEntries(
        [{ ...metricRow("not_a_metric", 1), value: Number.NaN }],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("diaryEntryHasMeasurementEvidence — QL environment family", () => {
  it("treats environment_check / environment event types as Measurements", () => {
    expect(
      diaryEntryHasMeasurementEvidence({
        details: { event_type: "environment", environment_check: { temperature_c: 24.4 } },
        note: "Environment check",
      }),
    ).toBe(true);
    expect(
      diaryEntryHasMeasurementEvidence({
        details: { event_type: "environment_check" },
        note: "",
      }),
    ).toBe(true);
  });

  it("keeps watering details as measurement and notes without evidence as not", () => {
    expect(
      diaryEntryHasMeasurementEvidence({
        details: { event_type: "observation", watering: { volume_ml: 100 } },
        note: "watered",
      }),
    ).toBe(true);
    expect(
      diaryEntryHasMeasurementEvidence({
        details: { event_type: "observation" },
        note: "just a note",
      }),
    ).toBe(false);
  });
});

describe("mergeTimelineMeasurementDisplayEntries", () => {
  it("surfaces the sensor receipt beside existing diary measurements without duplicating ids", () => {
    const diary = [
      {
        id: "diary-old",
        entry_at: "2026-09-01T12:00:00.000Z",
        details: { event_type: "measurement", watering: { volume_ml: 100 } },
        note: "82/48",
      },
    ];
    const sensor = manualSensorReadingsToTimelineEntries(
      [metricRow("temperature_c", fahrenheitToCelsius(76)), metricRow("humidity_pct", 58)],
      NOW,
    );
    const merged = mergeTimelineMeasurementDisplayEntries(diary, sensor);
    const measurements = merged.filter((entry) => diaryEntryHasMeasurementEvidence(entry));
    expect(measurements.map((row) => row.id)).toEqual([sensor[0].id, "diary-old"]);
  });
});

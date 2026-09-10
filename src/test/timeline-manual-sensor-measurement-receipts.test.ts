/**
 * Pins the Grow Timeline Measurements receipt path for tent Manual
 * Sensor Snapshots that persist only as `sensor_readings` (source=manual).
 *
 * Does not invent live metrics. Rows are insert-equivalent fixtures.
 */
import { describe, expect, it } from "vitest";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import {
  diaryEntryHasMeasurementEvidence,
  isTimelineManualSensorPersistedQualityUsable,
  isTimelineManualSensorReceiptFresh,
  isTimelineSensorDerivedDiaryId,
  manualSensorReadingsToTimelineEntries,
  mergeTimelineMeasurementDisplayEntries,
  TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX,
} from "@/lib/timelineManualSensorMeasurementRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const CAPTURED = "2026-09-09T18:46:00.000Z";
/** Inside the Timeline "Stale snapshot" window (15 minutes). */
const NOW = new Date("2026-09-09T18:51:00.000Z");

function metricRow(
  metric: string,
  value: number,
  source = "manual",
  extras: { quality?: string; ts?: string; captured_at?: string } = {},
) {
  const ts = extras.ts ?? CAPTURED;
  return {
    tent_id: TENT,
    metric,
    value,
    source,
    ts,
    captured_at: extras.captured_at ?? ts,
    quality: extras.quality ?? "ok",
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
    expect(receipt.details.sensor_snapshot).toMatchObject({
      source: "manual",
      rh: 58,
    });
    const canonical = receipt.details.sensor_snapshot as { temp_c: number };
    expect(canonical.temp_c).toBeCloseTo(fahrenheitToCelsius(76), 5);
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

  it("excludes invalid/degraded/stale quality so they are not ordinary receipts", () => {
    const tempC = fahrenheitToCelsius(76);
    for (const quality of ["invalid", "degraded", "stale", " STALE ", "Invalid"] as const) {
      expect(isTimelineManualSensorPersistedQualityUsable(quality)).toBe(false);
      expect(
        manualSensorReadingsToTimelineEntries(
          [
            metricRow("temperature_c", tempC, "manual", { quality }),
            metricRow("humidity_pct", 58, "manual", { quality }),
          ],
          NOW,
        ),
      ).toEqual([]);
    }
  });

  it("excludes a quality-ok manual the evidence drawer would badge Stale snapshot (Toad Pin 1)", () => {
    const tempC = fahrenheitToCelsius(72);
    const capturedAt = "2026-09-10T00:37:25.988+00:00";
    const now = new Date("2026-09-10T05:01:00.000Z");
    expect(now.getTime() - Date.parse(capturedAt)).toBeGreaterThan(LIVE_CURRENT_STATE_STALE_MS);
    expect(isTimelineManualSensorReceiptFresh(capturedAt, now)).toBe(false);
    expect(
      manualSensorReadingsToTimelineEntries(
        [
          metricRow("temperature_c", tempC, "manual", { ts: capturedAt, quality: "ok" }),
          metricRow("humidity_pct", 56, "manual", { ts: capturedAt, quality: "ok" }),
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("still includes a quality-ok manual inside the Stale snapshot window", () => {
    const tempC = fahrenheitToCelsius(72);
    expect(isTimelineManualSensorReceiptFresh(CAPTURED, NOW)).toBe(true);
    expect(
      manualSensorReadingsToTimelineEntries(
        [metricRow("temperature_c", tempC), metricRow("humidity_pct", 56)],
        NOW,
      ),
    ).toHaveLength(1);
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
    const diary: Array<{
      id: string;
      entry_at: string;
      details: Record<string, unknown>;
      note: string;
    }> = [
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

/**
 * Pins the Grow Timeline Measurements receipt path for tent Manual
 * Sensor Snapshots that persist only as `sensor_readings` (source=manual).
 *
 * Does not invent live metrics. Rows are insert-equivalent fixtures.
 */
import { describe, expect, it } from "vitest";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import { MANUAL_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import {
  diaryEntryBelongsInTimelineMeasurements,
  diaryEntryHasMeasurementEvidence,
  isTimelineManualSensorPersistedQualityUsable,
  isTimelineSensorDerivedDiaryId,
  manualSensorReadingsToTimelineEntries,
  mergeTimelineMeasurementDisplayEntries,
  TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX,
  timelineManualSnapshotHistoryNotice,
} from "@/lib/timelineManualSensorMeasurementRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const CAPTURED = "2026-09-09T18:46:00.000Z";
/** A recent reading, before it becomes historical. */
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
  it("uses the effective corrected value in the receipt note, not a stale raw reading", () => {
    const correctedTempC = fahrenheitToCelsius(77);
    const rows = [metricRow("temperature_c", correctedTempC), metricRow("humidity_pct", 58)];
    const [receipt] = manualSensorReadingsToTimelineEntries(rows, NOW);
    expect(receipt?.note).toContain("77°F");
    expect(receipt?.note).not.toContain("75.2°F");
    const snap = receipt?.details.manual_sensor_snapshot as { temp_f: number };
    expect(snap.temp_f).toBeCloseTo(77, 5);
  });

  it("uses captured_at for receipt entry_at when ts differs from the observation time", () => {
    const now = new Date("2026-07-16T05:05:00.000Z");
    const ts = "2026-07-15T19:55:00.000Z";
    const capturedAt = "2026-07-16T05:00:00.000Z";
    const tempC = fahrenheitToCelsius(76);
    const [receipt] = manualSensorReadingsToTimelineEntries(
      [
        metricRow("temperature_c", tempC, "manual", { ts, captured_at: capturedAt }),
        metricRow("humidity_pct", 58, "manual", { ts, captured_at: capturedAt }),
      ],
      now,
    );
    expect(receipt?.entry_at).toBe(capturedAt);
    expect(receipt?.entry_at).not.toBe(ts);
  });

  it("post-filter on entry_at drops receipts whose captured_at sits outside the active window", () => {
    const startIso = "2026-07-15T05:00:00.000Z";
    const endIso = "2026-07-16T04:59:59.999Z";
    const now = new Date("2026-07-16T05:05:00.000Z");
    const ts = "2026-07-15T19:55:00.000Z";
    const capturedAt = "2026-07-16T05:00:00.000Z";
    const tempC = fahrenheitToCelsius(76);
    let receipts = manualSensorReadingsToTimelineEntries(
      [
        metricRow("temperature_c", tempC, "manual", { ts, captured_at: capturedAt }),
        metricRow("humidity_pct", 58, "manual", { ts, captured_at: capturedAt }),
      ],
      now,
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].entry_at).toBe(capturedAt);
    receipts = receipts.filter((row) => row.entry_at >= startIso && row.entry_at <= endIso);
    expect(receipts).toEqual([]);
  });

  it.each([
    [5 * 60 * 1000, 1],
    [5 * 60 * 1000 + 1, 0],
    [9 * 60 * 60 * 1000, 0],
  ])(
    "applies future capture validity at +%i ms instead of trusting a fresh ts",
    (offsetMs, count) => {
      const now = new Date("2026-07-15T20:00:00.000Z");
      const ts = "2026-07-15T19:55:00.000Z";
      const capturedAt = new Date(now.getTime() + offsetMs).toISOString();
      const receipts = manualSensorReadingsToTimelineEntries(
        [
          metricRow("temperature_c", fahrenheitToCelsius(76), "manual", {
            ts,
            captured_at: capturedAt,
          }),
          metricRow("humidity_pct", 58, "manual", { ts, captured_at: capturedAt }),
        ],
        now,
      );
      expect(receipts).toHaveLength(count);
      if (count === 1) expect(receipts[0].entry_at).toBe(capturedAt);
    },
  );

  it("includes a grouped manual temp+RH snapshot in the Measurements query/view", () => {
    const tempC = fahrenheitToCelsius(76);
    const rows = [metricRow("temperature_c", tempC), metricRow("humidity_pct", 58)];
    const receipts = manualSensorReadingsToTimelineEntries(rows, NOW);
    const measurements = receipts.filter((entry) =>
      diaryEntryBelongsInTimelineMeasurements(entry, NOW),
    );

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

  it("retains an older manual reading and presents only observed soil moisture", () => {
    const now = new Date("2026-09-12T18:51:00.000Z");
    const rows = [
      metricRow("temperature_c", fahrenheitToCelsius(76)),
      metricRow("humidity_pct", 58),
      metricRow("soil_moisture_pct", 42),
    ];
    const receipts = manualSensorReadingsToTimelineEntries(rows, now);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].entry_at).toBe(CAPTURED);
    expect(receipts[0].note).toContain("42% soil moisture");
    expect(receipts[0].details.manual_sensor_snapshot).toMatchObject({
      source: "manual",
      soil_moisture_pct: 42,
    });
    expect(receipts[0].details.sensor_snapshot).toMatchObject({ source: "manual", soil: 42 });
    expect(diaryEntryBelongsInTimelineMeasurements(receipts[0], now)).toBe(true);
    expect(manualSensorReadingsToTimelineEntries(rows, now)).toEqual(receipts);
  });

  it("does not invent soil moisture or present an out-of-range soil metric as valid", () => {
    const now = new Date("2026-09-12T18:51:00.000Z");
    const rows = [metricRow("temperature_c", fahrenheitToCelsius(76))];
    const [withoutSoil] = manualSensorReadingsToTimelineEntries(rows, now);
    expect(withoutSoil.note).not.toContain("soil moisture");
    expect(withoutSoil.details.sensor_snapshot).not.toHaveProperty("soil");
    const [badSoil] = manualSensorReadingsToTimelineEntries(
      [...rows, metricRow("soil_moisture_pct", 101)],
      now,
    );
    expect(badSoil.details.sensor_snapshot).not.toHaveProperty("soil");
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

  it("retains a quality-ok manual after its current-state freshness expires (Toad Pin 1)", () => {
    const tempC = fahrenheitToCelsius(72);
    const capturedAt = "2026-09-10T00:37:25.988+00:00";
    const now = new Date("2026-09-10T05:01:00.000Z");
    const receipts = manualSensorReadingsToTimelineEntries(
      [
        metricRow("temperature_c", tempC, "manual", { ts: capturedAt, quality: "ok" }),
        metricRow("humidity_pct", 56, "manual", { ts: capturedAt, quality: "ok" }),
      ],
      now,
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].entry_at).toBe(capturedAt);
    expect(diaryEntryBelongsInTimelineMeasurements(receipts[0], now)).toBe(true);
  });

  it("retains diary-shaped Pin 1 evidence in Measurements as history", () => {
    const capturedAt = "2026-09-10T00:37:25.988+00:00";
    const now = new Date("2026-09-10T05:01:00.000Z");
    const pin1Diary = {
      id: "7c2f0e1a-4b33-4d91-9c0e-stale-manual-pin1",
      note: "Manual sensor snapshot: 72°F, 56% RH",
      entry_at: capturedAt,
      details: {
        event_type: "measurement",
        source: "manual",
        sensor_snapshot: {
          source: "manual",
          ts: capturedAt,
          temp_c: fahrenheitToCelsius(72),
          rh: 56,
        },
        manual_sensor_snapshot: {
          source: "manual",
          ts: capturedAt,
          temp_f: 72,
          humidity_percent: 56,
        },
      },
    };
    expect(diaryEntryHasMeasurementEvidence(pin1Diary)).toBe(true);
    expect(diaryEntryBelongsInTimelineMeasurements(pin1Diary, now)).toBe(true);

    const pin1Sibling = {
      ...pin1Diary,
      id: "8d3f1f2b-5c44-4e02-8d1f-stale-manual-pin1b",
      note: "Manual sensor snapshot: 73°F, 57% RH",
      details: {
        ...pin1Diary.details,
        sensor_snapshot: {
          source: "manual",
          ts: capturedAt,
          temp_c: fahrenheitToCelsius(73),
          rh: 57,
        },
        manual_sensor_snapshot: {
          source: "manual",
          ts: capturedAt,
          temp_f: 73,
          humidity_percent: 57,
        },
      },
    };
    expect(diaryEntryBelongsInTimelineMeasurements(pin1Sibling, now)).toBe(true);
  });

  it("retains old Quick Log manual envelopes while capture-time verification stays separate", () => {
    const capturedAt = "2026-09-10T00:37:25.988+00:00";
    const now = new Date("2026-09-10T05:01:00.000Z");
    const livePairs = [
      [72, 56],
      [73, 57],
      [74, 55],
      [76, 58],
      [75, 60],
    ] as const;
    for (const [tempF, rh] of livePairs) {
      const liveRow = {
        id: `toad-pin1-live-${tempF}-${rh}`,
        note: `Manual sensor snapshot: ${tempF}°F, ${rh}% RH`,
        entry_at: capturedAt,
        details: {
          event_type: "quick_log",
          plant_id: "4cad3cae-plant",
          tent_id: TENT,
          manual_sensor_snapshot: {
            temp_f: tempF,
            humidity_percent: rh,
            ph: null,
            ec: null,
            source: "manual",
          },
        },
      };
      expect(diaryEntryHasMeasurementEvidence(liveRow)).toBe(true);
      expect(diaryEntryBelongsInTimelineMeasurements(liveRow, now)).toBe(true);
    }
  });

  it("retains a QL v2 companion snap that stores captured_at instead of ts", () => {
    const capturedAt = "2026-09-10T00:37:25.988+00:00";
    const now = new Date("2026-09-10T05:01:00.000Z");
    expect(
      diaryEntryBelongsInTimelineMeasurements(
        {
          id: "toad-pin1-captured-at-only",
          note: "Manual sensor snapshot: 72°F, 56% RH",
          entry_at: capturedAt,
          details: {
            event_type: "environment_check",
            source: "manual",
            sensor_snapshot: {
              source: "manual",
              captured_at: capturedAt,
              metrics: { temp_c: fahrenheitToCelsius(72), rh: 56 },
            },
          },
        },
        now,
      ),
    ).toBe(true);
  });

  it("still includes a quality-ok recent manual", () => {
    const tempC = fahrenheitToCelsius(72);
    expect(
      manualSensorReadingsToTimelineEntries(
        [metricRow("temperature_c", tempC), metricRow("humidity_pct", 56)],
        NOW,
      ),
    ).toHaveLength(1);
    expect(
      diaryEntryBelongsInTimelineMeasurements(
        {
          id: `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}${TENT}:${CAPTURED}`,
          note: "Manual sensor snapshot: 72°F, 56% RH",
          entry_at: CAPTURED,
          details: {
            event_type: "measurement",
            source: "manual",
            sensor_snapshot: { source: "manual", ts: CAPTURED, temp_c: tempC, rh: 56 },
          },
        },
        NOW,
      ),
    ).toBe(true);
    expect(
      diaryEntryBelongsInTimelineMeasurements(
        {
          id: "fresh-ql-persist-manual",
          note: "Manual sensor snapshot: 72°F, 56% RH",
          entry_at: CAPTURED,
          details: {
            event_type: "quick_log",
            tent_id: TENT,
            manual_sensor_snapshot: {
              temp_f: 72,
              humidity_percent: 56,
              ph: null,
              ec: null,
              source: "manual",
            },
          },
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps watering Measurements when an attached manual snapshot is stale", () => {
    const capturedAt = "2026-09-10T00:37:25.988+00:00";
    const now = new Date("2026-09-10T05:01:00.000Z");
    expect(
      diaryEntryBelongsInTimelineMeasurements(
        {
          id: "watering-with-stale-snap",
          note: "watered",
          entry_at: capturedAt,
          details: {
            event_type: "watering",
            watering: { volume_ml: 100 },
            sensor_snapshot: { source: "manual", ts: capturedAt, temp_c: 22.2, rh: 56 },
          },
        },
        now,
      ),
    ).toBe(true);
    expect(
      diaryEntryBelongsInTimelineMeasurements(
        {
          id: "watering-with-stale-ql-envelope",
          note: "watered",
          entry_at: capturedAt,
          details: {
            event_type: "watering",
            watering: { volume_ml: 100 },
            manual_sensor_snapshot: {
              temp_f: 72,
              humidity_percent: 56,
              ph: null,
              ec: null,
              source: "manual",
            },
          },
        },
        now,
      ),
    ).toBe(true);
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

describe("timelineManualSnapshotHistoryNotice", () => {
  const capturedMs = Date.parse(CAPTURED);
  const input = {
    sourceKind: "manual",
    capturedAt: CAPTURED,
    staleMs: MANUAL_CURRENT_STATE_STALE_MS,
  };

  it("changes from current to clearly historical at the manual freshness boundary", () => {
    expect(
      timelineManualSnapshotHistoryNotice({
        ...input,
        nowMs: capturedMs + MANUAL_CURRENT_STATE_STALE_MS,
      }),
    ).toBeNull();
    expect(
      timelineManualSnapshotHistoryNotice({
        ...input,
        nowMs: capturedMs + MANUAL_CURRENT_STATE_STALE_MS + 1,
      }),
    ).toBe("Historical manual reading — not current.");
  });

  it("does not infer current time from a missing or malformed observation timestamp", () => {
    for (const capturedAt of [null, "not-a-date"]) {
      expect(timelineManualSnapshotHistoryNotice({ ...input, capturedAt, nowMs: capturedMs })).toBe(
        "Capture time unverified — not current.",
      );
    }
    expect(
      timelineManualSnapshotHistoryNotice({ ...input, sourceKind: "live", nowMs: capturedMs }),
    ).toBeNull();
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
    const measurements = merged.filter((entry) =>
      diaryEntryBelongsInTimelineMeasurements(entry, NOW),
    );
    expect(measurements.map((row) => row.id)).toEqual([sensor[0].id, "diary-old"]);
  });
});

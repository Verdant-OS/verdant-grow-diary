/**
 * Production Quick Log shape for a Whole-tent Note plus a manual climate.
 *
 * The diary companion carries `quick_log_activity: "note"` and, after the
 * timeline readback, a `sensor_snapshot` that stores Celsius as `temp_c`
 * (not `temp`). Classification used to stop at the note marker, so the row
 * stayed Note, the Measurements chip ignored it, and Recent quick logs
 * showed the note text with no values.
 */
import { describe, expect, it } from "vitest";
import { manualClimateAsSnapshotRows } from "@/components/EcowittTentSnapshotV0Card";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { buildEcowittTentSnapshotV0ViewModel } from "@/lib/ecowittTentSnapshotV0ViewModel";
import { resolveEffectiveQuickLogCareType } from "@/lib/environmentCheckTimelineViewModel";
import { buildMeasurementHistory, buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { diaryEntryBelongsInTimelineMeasurements } from "@/lib/timelineManualSensorMeasurementRules";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";

const TEMP_C = fahrenheitToCelsius(76);
const OBSERVED_AT = "2026-11-02T20:34:00.000Z";

/** Shape Timeline attaches from the environment sibling, and that the save now persists. */
const notedSnapshotDetails = {
  quick_log_activity: "note",
  manual_provenance: {
    source: "manual",
    source_identity: "manual_entry",
    transport: "manual",
    confidence: null,
  },
  linked_grow_event_id: "observation-parent",
  sensor_snapshot: {
    source: "manual",
    ts: OBSERVED_AT,
    temp_c: TEMP_C,
    rh: 55,
  },
  manual_sensor_snapshot: {
    source: "manual",
    ts: OBSERVED_AT,
    temp_f: 76,
    humidity_percent: 55,
  },
};

describe("note plus manual snapshot uses the production details shape", () => {
  it("classifies the note-marker snapshot as a measurement and counts it", () => {
    expect(resolveEffectiveQuickLogCareType({ details: notedSnapshotDetails })).toBe("measurement");
    expect(
      diaryEntryBelongsInTimelineMeasurements({
        id: "diary-1",
        details: notedSnapshotDetails,
        note: "QA-SYNTH 2733 r1",
        entry_at: OBSERVED_AT,
      }),
    ).toBe(true);
  });

  it("keeps a note with no climate as a note", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        details: { quick_log_activity: "note", linked_grow_event_id: "observation-parent" },
      }),
    ).toBe("note");
  });

  it("persists temp_c and rh on the diary companion for a whole-tent note", () => {
    const saved = buildQuickLogV2SavePayload({
      resolved: {
        ok: true,
        targetType: "tent",
        targetId: "tent-1",
        tentId: "tent-1",
        plantId: null,
      },
      action: "note",
      volumeMl: "",
      note: "QA-SYNTH 2733 r1",
      temperatureC: String(TEMP_C),
      humidityPct: "55",
      vpdKpa: "",
      idempotencyKey: "quicklog-v2-2733-tent",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const details = saved.payload.p_details as Record<string, unknown>;
    expect(details.quick_log_activity).toBe("note");
    expect(details.sensor_snapshot).toEqual({
      source: "manual",
      temp: TEMP_C,
      temp_c: TEMP_C,
      rh: 55,
    });
    expect(details.manual_sensor_snapshot).toMatchObject({
      source: "manual",
      humidity_percent: 55,
    });
  });

  it("shows 76°F and 55% RH on Recent quick logs and in the measurement lane", () => {
    const entry = normalizeDiaryEntry({
      id: "diary-1",
      entry_at: OBSERVED_AT,
      tent_id: "tent-1",
      note: "QA-SYNTH 2733 r1",
      details: notedSnapshotDetails,
    });
    expect(entry).not.toBeNull();
    if (!entry) return;
    const recent = buildRecentQuickLogActivity([entry]);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.climate?.rh).toBe(55);
    expect(recent[0]?.climate?.tempC).toBeCloseTo(TEMP_C, 5);
    expect(buildMeasurementHistory([entry]).map((row) => row.id)).toEqual(["diary-1"]);
  });

  it("lets a newer manual climate replace the previous Sensor Snapshot card reading", () => {
    const now = new Date("2026-11-02T20:40:00.000Z");
    const manuals = manualClimateAsSnapshotRows(
      [
        {
          ts: OBSERVED_AT,
          tentId: "tent-1",
          temp: TEMP_C,
          rh: 55,
          vpd: 0,
          co2: 0,
          soil: 0,
          source: "manual",
          status: "usable",
          capturedAt: OBSERVED_AT,
          observedMetrics: ["temp", "rh"],
        },
      ],
      "tent-1",
    );
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        {
          source: "live",
          ts: "2026-11-02T18:00:00.000Z",
          metric: "temperature_c",
          value: 20,
          tent_id: "tent-1",
        },
        {
          source: "live",
          ts: "2026-11-02T18:00:00.000Z",
          metric: "humidity_pct",
          value: 40,
          tent_id: "tent-1",
        },
        ...manuals,
      ],
      { tentId: "tent-1", now },
    );
    const temp = vm.metrics.find((metric) => metric.key === "temp");
    const rh = vm.metrics.find((metric) => metric.key === "rh");
    expect(temp?.value).toBeCloseTo(TEMP_C, 5);
    expect(temp?.truthSource).toBe("manual");
    expect(rh?.value).toBe(55);
    expect(rh?.truthSource).toBe("manual");
  });
});

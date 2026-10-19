/**
 * #2173 S part — What's Missing must see a plant-page Quick Log manual snapshot.
 *
 * Quick Log stores the reading on details.manual_sensor_snapshot. The recent
 * activity row only treated details.sensorSnapshot as present, so a fresh
 * manual reading still produced "No sensor snapshot".
 *
 * Presence only. temp_f stays out of sensorSnapshot.temp (that field is
 * consumed elsewhere and this slice does not prove its unit).
 */
import { describe, expect, it } from "vitest";

import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { derivePlantDetailActivitySignals } from "@/lib/plantDetailWhatsMissing";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildManualSensorProvenance } from "@/lib/manualSensorProvenanceRules";
import {
  buildManualSensorSnapshot,
  buildQuickLogDetails,
  type QuickLogDetails,
} from "@/lib/quickLogRules";

const PLANT_ID = "plant-2173";
const NOW = Date.parse("2026-10-19T16:00:00.000Z");
const CAPTURED_AT = "2026-10-19T15:00:00.000Z";

function diaryRow(details: QuickLogDetails | Record<string, unknown>, id = "ql-manual-1") {
  return {
    id,
    plant_id: PLANT_ID,
    created_at: CAPTURED_AT,
    occurred_at: CAPTURED_AT,
    event_type: "quick_log",
    note: "Quick Log manual reading",
    details,
  };
}

function snapshotPresence(details: QuickLogDetails | Record<string, unknown>, id?: string) {
  const row = diaryRow(details, id);
  const [activity] = buildPlantRecentActivity([row], { plantId: PLANT_ID, now: NOW });
  const signals = derivePlantDetailActivitySignals(PLANT_ID, false, [row]);
  return { row, activity, signals };
}

describe("What's Missing manual sensor snapshot (#2173 S)", () => {
  it("counts a Quick Log manual_sensor_snapshot as present", () => {
    const details = buildQuickLogDetails({
      plantId: PLANT_ID,
      sensors: { ec: "1.2", temp: "75", humidity: "", ph: "" },
    });
    const row = diaryRow(details);
    const normalized = normalizeDiaryEntries({ rawEntries: [row], now: NOW });

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.details.sensorSnapshot).toBeUndefined();
    expect(normalized[0]?.details.extras?.manual_sensor_snapshot).toMatchObject({
      temp_f: 75,
      ec: 1.2,
      source: "manual",
    });

    const [activity] = buildPlantRecentActivity([row], { plantId: PLANT_ID, now: NOW });
    expect(activity?.hasSnapshot).toBe(true);
    expect(activity?.snapshotAt).toBeNull();

    const signals = derivePlantDetailActivitySignals(PLANT_ID, false, [row]);
    expect(signals?.hasSensorSnapshot).toBe(true);
  });

  it("stays false when details have no snapshot keys", () => {
    const { activity, signals } = snapshotPresence({
      event_type: "quick_log",
      plant_id: PLANT_ID,
    });
    expect(activity?.hasSnapshot).toBe(false);
    expect(signals?.hasSensorSnapshot).toBe(false);
  });

  it("stays false when buildManualSensorSnapshot receives all-empty sensors", () => {
    const sensors = { ec: "", temp: "", humidity: "", ph: "" };
    expect(buildManualSensorSnapshot(sensors)).toBeNull();

    const details = buildQuickLogDetails({ plantId: PLANT_ID, sensors });
    expect(details.manual_sensor_snapshot).toBeUndefined();

    const { activity, signals } = snapshotPresence(details, "ql-empty");
    expect(activity?.hasSnapshot).toBe(false);
    expect(signals?.hasSensorSnapshot).toBe(false);
  });

  it("does not count an all-null manual snapshot or a non-manual source", () => {
    const emptyManual = snapshotPresence(
      {
        event_type: "quick_log",
        plant_id: PLANT_ID,
        manual_sensor_snapshot: {
          temp_f: null,
          humidity_percent: null,
          ph: null,
          ec: null,
          source: "manual",
          manual_provenance: buildManualSensorProvenance(),
        },
      },
      "ql-all-null",
    );
    expect(emptyManual.activity?.hasSnapshot).toBe(false);
    expect(emptyManual.signals?.hasSensorSnapshot).toBe(false);

    const liveLabeled = snapshotPresence(
      {
        event_type: "quick_log",
        plant_id: PLANT_ID,
        manual_sensor_snapshot: {
          temp_f: 75,
          humidity_percent: null,
          ph: null,
          ec: null,
          source: "live",
          manual_provenance: buildManualSensorProvenance(),
        },
      },
      "ql-live-label",
    );
    expect(liveLabeled.activity?.hasSnapshot).toBe(false);
    expect(liveLabeled.signals?.hasSensorSnapshot).toBe(false);

    const taggedArray = Object.assign([{ temp_f: 75, source: "manual" }], {
      source: "manual",
      temp_f: 75,
    });
    const arrayPayload = snapshotPresence(
      {
        event_type: "quick_log",
        plant_id: PLANT_ID,
        manual_sensor_snapshot: taggedArray,
      },
      "ql-array",
    );
    expect(arrayPayload.activity?.hasSnapshot).toBe(false);
    expect(arrayPayload.signals?.hasSensorSnapshot).toBe(false);
  });
});

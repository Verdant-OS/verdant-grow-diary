import { describe, expect, it } from "vitest";

import {
  correctionValuePropsFromDiaryDetails,
  correctionValuesForTimelineAction,
  correctionValuesForTimelineDiaryEntry,
  validateQuickLogCorrection,
} from "@/lib/quick-log/quickLogRevisionRules";

const now = () => new Date("2026-08-11T10:00:00.000Z");

describe("Quick Log correction value resolution", () => {
  it("reads feeding dose from nutrients when products are absent", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "feeding",
        nutrients: [{ name: "CalMag", amount: 1.5, unit: "ml/L" }],
      }),
    ).toEqual({ kind: "feeding", doseAmount: 1.5 });
  });

  it("prefers feeding.products amount over nutrients when both exist", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "feeding",
        nutrients: [{ amount: 9 }],
        feeding: { products: [{ name: "Grow", amount: 2, unit: "ml" }] },
      }),
    ).toEqual({ kind: "feeding", doseAmount: 2 });
  });

  it("reads watering volume from camelCase flat fields", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "watering",
        wateringAmountMl: 320,
      }),
    ).toEqual({ kind: "watering", volumeMl: 320 });
  });

  it("reads sensor metrics from manual_sensor_snapshot on environment entries", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "manual_sensor_snapshot",
        manual_sensor_snapshot: {
          metrics: { temperature_c: 21, humidity_pct: 48, vpd_kpa: 0.85 },
        },
      }),
    ).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 21, humidity_pct: 48, vpd_kpa: 0.85 },
    });
  });

  it("builds sensor correction context from timeline action readings", () => {
    expect(
      correctionValuesForTimelineAction({ kind: "environment", aiDoctorPhase1Evidence: null }, [
        { field: "air_temp_c", value: 23.5 },
        { field: "humidity_pct", value: 52 },
        { field: "vpd_kpa", value: 1.05 },
      ]),
    ).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 23.5, humidity_pct: 52, vpd_kpa: 1.05 },
    });
  });

  it("returns null for observation rows with no embedded sensor and no resolvable sibling", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        {
          plant_id: "plant-a",
          entry_at: "2026-07-25T13:03:28.000Z",
          details: { event_type: "observation", quick_log_version: 2 },
        },
        [
          {
            id: "other-plant-env",
            event_type: "environment",
            source: "manual",
            plant_id: "plant-b",
            occurred_at: "2026-07-25T13:03:28.000Z",
            environment_events: { temperature_c: 24 },
          },
        ],
      ),
    ).toBeNull();
  });

  it("returns null when linked_grow_event_id has no environment companion at the same created_at", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        {
          plant_id: "plant-a",
          entry_at: "2026-07-25T13:03:28.000Z",
          details: {
            event_type: "observation",
            linked_grow_event_id: "root-1",
          },
        },
        [
          {
            id: "root-1",
            event_type: "observation",
            source: "manual",
            created_at: "2026-07-25T13:03:28.412Z",
          },
        ],
      ),
    ).toBeNull();
  });
});

describe("Quick Log correction validation boundaries", () => {
  it("accepts minimum valid volume and zero dose", () => {
    expect(validateQuickLogCorrection({ volumeMl: 1 }, null, now)).toEqual({
      ok: true,
      changes: { volume_ml: 1 },
    });
    expect(validateQuickLogCorrection({ doseAmount: 0 }, null, now)).toEqual({
      ok: true,
      changes: { dose_amount: 0 },
    });
  });

  it("accepts a partial sensor patch with one valid metric", () => {
    expect(validateQuickLogCorrection({ sensorValues: { humidity_pct: 50 } }, null, now)).toEqual({
      ok: true,
      changes: { sensor_values: { humidity_pct: 50 } },
    });
  });

  it("rejects sensor payloads with no valid metrics", () => {
    expect(validateQuickLogCorrection({ sensorValues: {} }, null, now)).toEqual({
      ok: false,
      reason: "invalid_changes",
    });
    expect(
      validateQuickLogCorrection({ sensorValues: { temperature_c: 9999 } }, null, now).ok,
    ).toBe(false);
  });
});

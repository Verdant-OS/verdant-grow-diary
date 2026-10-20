import { describe, expect, it } from "vitest";

import {
  QUICKLOG_CORRECTION_REASON_CHIPS,
  correctionValuePropsFromDiaryDetails,
  validateQuickLogCorrection,
} from "@/lib/quick-log/quickLogRevisionRules";
import { EDITABLE_VALUES_CORRECT_ENTRY_FINGERPRINT } from "../../scripts/assert-required-core-migrations-applied.mjs";
import {
  isHumidityValid,
  isTemperatureValid,
  isVpdValid,
} from "@/lib/sensorReadingNormalizationRules";

const now = () => new Date("2026-08-11T10:00:00.000Z");

describe("Quick Log correction editable values", () => {
  it("keeps Wrong value as a correction reason", () => {
    expect(QUICKLOG_CORRECTION_REASON_CHIPS).toContain("wrong_value");
  });

  it("accepts a watering volume inside the merged 1 ml to 1,000,000 ml bound", () => {
    expect(validateQuickLogCorrection({ volumeMl: 750 }, null, now)).toEqual({
      ok: true,
      changes: { volume_ml: 750 },
    });
    expect(validateQuickLogCorrection({ volumeMl: 0 }, null, now)).toEqual({
      ok: false,
      reason: "invalid_changes",
    });
    expect(validateQuickLogCorrection({ volumeMl: 1_000_001 }, null, now)).toEqual({
      ok: false,
      reason: "invalid_changes",
    });
  });

  it("accepts a feeding dose inside the merged 0 to 1,000,000 bound", () => {
    expect(validateQuickLogCorrection({ doseAmount: 2.5 }, null, now)).toEqual({
      ok: true,
      changes: { dose_amount: 2.5 },
    });
    expect(validateQuickLogCorrection({ doseAmount: -1 }, null, now)).toEqual({
      ok: false,
      reason: "invalid_changes",
    });
  });

  it("accepts sensor values inside the merged temperature, humidity, and VPD ranges", () => {
    const sensor = { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 };
    expect(isTemperatureValid(sensor.temperature_c)).toBe(true);
    expect(isHumidityValid(sensor.humidity_pct)).toBe(true);
    expect(isVpdValid(sensor.vpd_kpa)).toBe(true);
    expect(validateQuickLogCorrection({ sensorValues: sensor }, null, now)).toEqual({
      ok: true,
      changes: { sensor_values: sensor },
    });
    expect(validateQuickLogCorrection({ sensorValues: { humidity_pct: 101 } }, null, now).ok).toBe(
      false,
    );
  });

  it("pins quicklog_correct_entry to the body that records the original measured values", () => {
    expect(EDITABLE_VALUES_CORRECT_ENTRY_FINGERPRINT).toEqual({
      md5: "bd77ce80b61a0a4158efe5335aba9aa3",
      bytes: 15604,
      prosrcMd5: "23f9abc2846e072bda8cd835b7359bbd",
      prosrcBytes: 15273,
    });
  });

  it("reads volume, dose, and sensor values from the saved diary details", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "watering",
        watering: { volume_ml: 400 },
      }),
    ).toEqual({ kind: "watering", volumeMl: 400 });
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "feeding",
        feeding: { products: [{ name: "Grow", amount: 3, unit: "ml" }] },
      }),
    ).toEqual({ kind: "feeding", doseAmount: 3 });
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "environment",
        sensor_snapshot: { metrics: { temperature_c: 22, humidity_pct: 60, vpd_kpa: 0.9 } },
      }),
    ).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 22, humidity_pct: 60, vpd_kpa: 0.9 },
    });
  });
});

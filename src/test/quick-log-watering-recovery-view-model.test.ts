import { describe, expect, it } from "vitest";
import type { PendingQuickLogWatering } from "@/lib/quickLogPendingWateringStore";
import { buildWateringRecoveryForm } from "@/lib/quickLogWateringRecoveryViewModel";

const at = "2026-09-17T04:00:00.000Z";
function record(): PendingQuickLogWatering {
  return {
    version: 1,
    ownerId: "owner-a",
    createdAt: at,
    payload: {
      idempotency_key: "original-water-key",
      grow_id: "grow-a",
      tent_id: "tent-a",
      plant_id: "plant-a",
      occurred_at: at,
      note: "Observed before watering",
      volume_ml: 750,
      ph: 6.1,
      ec_ms_cm: 1.2,
      runoff_ml: 90,
      runoff_ph: 6.3,
      runoff_ec: 1.4,
      water_temp_c: 21,
      sensor_snapshot: {
        source: "manual",
        captured_at: at,
        metrics: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
      },
      details: {
        root_zone_manual_observation_v1: {
          schema_version: 1,
          source: "manual",
          evidence_type: "root_zone_manual_observation",
          advisory_only: true,
          observed_at: at,
          pot_weight_feel: "light",
          medium_surface: "dry",
          drainage: "normal",
        },
      },
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: "plant-a",
      growId: "grow-a",
      tentId: "tent-a",
      plantId: "plant-a",
    },
    attachments: { photo: false, video: false },
  };
}

describe("Water recovery presentation", () => {
  it("shows the original target and canonical measurements without reinterpreting temperature", () => {
    const recovered = buildWateringRecoveryForm(record());
    expect(recovered.form).toMatchObject({
      selectedKey: "plant:plant-a",
      action: "water",
      note: "Observed before watering",
      temperatureC: "24",
      humidityPct: "55",
      vpdKpa: "1.1",
    });
    expect(recovered.wateringForm).toEqual({
      volumeMl: "750",
      ph: "6.1",
      ec: "1.2",
      ppm: "",
      runoffMl: "90",
      runoffPh: "6.3",
      runoffEc: "1.4",
      runoffPpm: "",
      waterTempC: "21",
      potWeightFeel: "light",
      mediumSurface: "dry",
      drainage: "normal",
    });
  });

  it("keeps absent measurements empty rather than inventing pH, EC or manual observations", () => {
    const saved = record();
    saved.payload = {
      idempotency_key: "original-water-key",
      grow_id: "grow-a",
      tent_id: "tent-a",
      plant_id: null,
      occurred_at: at,
      volume_ml: 750,
      note: null,
    };
    saved.resolved = {
      ok: true,
      targetType: "tent",
      targetId: "tent-a",
      growId: "grow-a",
      tentId: "tent-a",
      plantId: null,
    };
    const recovered = buildWateringRecoveryForm(saved);
    expect(recovered.form).toMatchObject({
      selectedKey: "tent:tent-a",
      action: "water",
      note: "",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
    });
    expect(recovered.wateringForm).toEqual({
      volumeMl: "750",
      ph: "",
      ec: "",
      ppm: "",
      runoffMl: "",
      runoffPh: "",
      runoffEc: "",
      runoffPpm: "",
      waterTempC: "",
      potWeightFeel: "",
      mediumSurface: "",
      drainage: "",
    });
  });

  it("does not modify the frozen write when restoring it repeatedly", () => {
    const saved = record();
    const before = structuredClone(saved);
    const first = buildWateringRecoveryForm(saved);
    first.form.note = "Edited display object";
    first.wateringForm.volumeMl = "900";
    const second = buildWateringRecoveryForm(saved);
    expect(second.form.note).toBe("Observed before watering");
    expect(second.wateringForm.volumeMl).toBe("750");
    expect(saved).toEqual(before);
  });
});

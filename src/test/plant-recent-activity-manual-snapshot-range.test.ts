/**
 * #2173 — out-of-range Quick Log readings are not a present sensor snapshot.
 *
 * Ranges come from snapshotFromManualSensorSnapshot: temp_f is converted to
 * Celsius and checked with isTemperatureValid; humidity uses isHumidityValid.
 */
import { describe, expect, it } from "vitest";

import { derivePlantDetailActivitySignals } from "@/lib/plantDetailWhatsMissing";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildManualSensorProvenance } from "@/lib/manualSensorProvenanceRules";

const PLANT_ID = "plant-2173-range";
const NOW = Date.parse("2026-10-19T16:00:00.000Z");
const CAPTURED_AT = "2026-10-19T15:30:00.000Z";

function row(
  readings: {
    temp_f: number | null;
    humidity_percent: number | null;
    ph: number | null;
    ec: number | null;
  },
  id: string,
) {
  return {
    id,
    plant_id: PLANT_ID,
    created_at: CAPTURED_AT,
    occurred_at: CAPTURED_AT,
    event_type: "quick_log",
    note: "Quick Log manual reading",
    details: {
      event_type: "quick_log",
      plant_id: PLANT_ID,
      manual_sensor_snapshot: {
        ...readings,
        source: "manual",
        manual_provenance: buildManualSensorProvenance(),
      },
    },
  };
}

function presence(id: string, readings: Parameters<typeof row>[0]) {
  const raw = row(readings, id);
  const [activity] = buildPlantRecentActivity([raw], { plantId: PLANT_ID, now: NOW });
  const signals = derivePlantDetailActivitySignals(PLANT_ID, false, [raw]);
  return { activity, signals };
}

const empty = { temp_f: null, humidity_percent: null, ph: null, ec: null };

describe("manual snapshot accepted ranges (#2173)", () => {
  it("does not count an out-of-range temperature or humidity as a snapshot", () => {
    const hot = presence("ql-temp-999", { ...empty, temp_f: 999 });
    expect(hot.activity?.hasSnapshot).toBe(false);
    expect(hot.signals?.hasSensorSnapshot).toBe(false);

    const dry = presence("ql-rh-neg", { ...empty, humidity_percent: -1 });
    expect(dry.activity?.hasSnapshot).toBe(false);
    expect(dry.signals?.hasSensorSnapshot).toBe(false);
  });

  it("still counts an in-range temperature", () => {
    const ok = presence("ql-temp-75", { ...empty, temp_f: 75 });
    expect(ok.activity?.hasSnapshot).toBe(true);
    expect(ok.signals?.hasSensorSnapshot).toBe(true);
  });

  it("keeps the snapshot when humidity is in range and temperature is not", () => {
    const mixed = presence("ql-mixed", { ...empty, temp_f: 999, humidity_percent: 55 });
    expect(mixed.activity?.hasSnapshot).toBe(true);
    expect(mixed.signals?.hasSensorSnapshot).toBe(true);
  });
});

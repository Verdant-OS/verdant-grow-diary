/**
 * #2118 Codex r4320990054 / r4320990057:
 * - the Fast Check sheet's diary companion carries linked_grow_event_id but no
 *   event_type; it must resolve through its observation root;
 * - PlantQuickLog V2 stores manual_sensor_snapshot as temp_f / humidity_percent.
 */
import { describe, expect, it } from "vitest";
import {
  correctionValuePropsFromDiaryDetails,
  correctionValuesForTimelineDiaryEntry,
} from "@/lib/quick-log/quickLogRevisionRules";

const CREATED = "2026-10-15T12:00:00.123456+00:00";
const OCCURRED = "2026-10-15T12:00:00.000Z";

function rows(rootType: string) {
  return [
    { id: "root-1", event_type: rootType, source: "manual", created_at: CREATED },
    {
      id: "env-1",
      event_type: "environment",
      source: "manual",
      plant_id: "plant-1",
      occurred_at: OCCURRED,
      created_at: CREATED,
      environment_events: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.3 },
    },
  ];
}

const fastCheckCompanion = {
  details: {
    manual_provenance: { source: "manual", transport: "manual" },
    linked_grow_event_id: "root-1",
  },
  plant_id: "plant-1",
  entry_at: OCCURRED,
};

describe("Fast Check diary companion without an event_type", () => {
  it("resolves the observation root's environment sibling", () => {
    expect(correctionValuesForTimelineDiaryEntry(fastCheckCompanion, rows("observation"))).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.3 },
    });
  });

  it("offers no sensor fields when the linked root is not an observation", () => {
    expect(correctionValuesForTimelineDiaryEntry(fastCheckCompanion, rows("training"))).toBeNull();
  });
});

describe("manual_sensor_snapshot aliases", () => {
  it("reads temp_f (as °C) and humidity_percent", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "observation",
        manual_sensor_snapshot: { temp_f: 77, humidity_percent: 55 },
      }),
    ).toEqual({ kind: "sensor", sensor: { temperature_c: 25, humidity_pct: 55 } });
  });

  it("prefers canonical Celsius keys when both are present", () => {
    expect(
      correctionValuePropsFromDiaryDetails({
        event_type: "manual_sensor_snapshot",
        manual_sensor_snapshot: { temperature_c: 24, temp_f: 77, humidity_pct: 50 },
      }),
    ).toEqual({ kind: "sensor", sensor: { temperature_c: 24, humidity_pct: 50 } });
  });
});

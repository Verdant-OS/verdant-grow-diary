import { describe, expect, it } from "vitest";

import {
  buildOperatorRootZoneRecordFromGrowEvent,
  buildOperatorRootZoneRecordsFromRows,
} from "@/lib/operatorRootZoneRecordRules";
import {
  buildRootZoneObservationFromGrowEvent,
  type RootZoneGrowEventRowLike,
  type RootZoneManualObservationDiaryRowLike,
} from "@/lib/rootZoneObservationRules";

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const EVENT_B = "22222222-2222-4222-8222-222222222222";
const PLANT_A = "33333333-3333-4333-8333-333333333333";
const PLANT_B = "44444444-4444-4444-8444-444444444444";
const TENT_ID = "55555555-5555-4555-8555-555555555555";

function wateringRow(overrides: Partial<RootZoneGrowEventRowLike> = {}): RootZoneGrowEventRowLike {
  return {
    id: EVENT_A,
    grow_id: "66666666-6666-4666-8666-666666666666",
    plant_id: PLANT_A,
    tent_id: TENT_ID,
    event_type: "watering",
    occurred_at: "2026-07-19T12:00:00.000Z",
    source: "manual",
    is_deleted: false,
    watering_events: [{ volume_ml: 750, ph: 6.2, ec_ms_cm: 1.4 }],
    feeding_events: [],
    ...overrides,
  };
}

describe("operator root-zone record rules", () => {
  it("adds only canonical event/plant/tent identity to the shared sanitized observation", () => {
    const row = wateringRow();
    const record = buildOperatorRootZoneRecordFromGrowEvent(row);

    expect(record).toMatchObject({
      eventId: EVENT_A,
      plantId: PLANT_A,
      tentId: TENT_ID,
      occurredAt: "2026-07-19T12:00:00.000Z",
      eventType: "watering",
      source: "manual",
      metrics: { volumeMl: 750, inputPh: 6.2, inputEcMsCm: 1.4 },
    });
    expect(buildRootZoneObservationFromGrowEvent(row)).not.toHaveProperty("eventId");
    expect(buildRootZoneObservationFromGrowEvent(row)).not.toHaveProperty("plantId");
    expect(buildRootZoneObservationFromGrowEvent(row)).not.toHaveProperty("tentId");
  });

  it("preserves separate same-time, same-metric events for different plants", () => {
    const records = buildOperatorRootZoneRecordsFromRows([
      wateringRow({ id: EVENT_B, plant_id: PLANT_B }),
      wateringRow({ id: EVENT_A, plant_id: PLANT_A }),
    ]);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.eventId)).toEqual([EVENT_A, EVENT_B]);
    expect(records.map((record) => record.plantId)).toEqual([PLANT_A, PLANT_B]);
  });

  it("deduplicates one event id deterministically and supports tent-level records", () => {
    const duplicate = wateringRow({
      id: EVENT_A,
      plant_id: null,
      watering_events: [{ volume_ml: 900 }],
    });
    const records = buildOperatorRootZoneRecordsFromRows([duplicate, duplicate]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ eventId: EVENT_A, plantId: null, tentId: TENT_ID });
  });

  it("preserves exact-linked manual observation context through the operator identity adapter", () => {
    const companion: RootZoneManualObservationDiaryRowLike = {
      id: "77777777-7777-4777-8777-777777777777",
      grow_id: "66666666-6666-4666-8666-666666666666",
      plant_id: PLANT_A,
      tent_id: TENT_ID,
      entry_at: "2026-07-19T12:00:00.000Z",
      linked_grow_event_id: EVENT_A,
      root_zone_manual_observation_v1: {
        schema_version: 1,
        source: "manual",
        evidence_type: "root_zone_manual_observation",
        advisory_only: true,
        observed_at: "2026-07-19T12:00:00.000Z",
        medium_surface: "moist",
      },
    };

    expect(buildOperatorRootZoneRecordsFromRows([wateringRow()], 20, [companion])).toEqual([
      expect.objectContaining({
        eventId: EVENT_A,
        manualObservation: {
          observedAt: "2026-07-19T12:00:00.000Z",
          source: "manual",
          advisoryOnly: true,
          mediumSurface: "moist",
        },
      }),
    ]);
  });

  it("fails closed on malformed identifiers and invalid shared observations", () => {
    expect(buildOperatorRootZoneRecordFromGrowEvent(wateringRow({ id: "event-a" }))).toBeNull();
    expect(buildOperatorRootZoneRecordFromGrowEvent(wateringRow({ tent_id: "tent-a" }))).toBeNull();
    expect(
      buildOperatorRootZoneRecordFromGrowEvent(wateringRow({ plant_id: "plant-a" })),
    ).toBeNull();
    expect(
      buildOperatorRootZoneRecordFromGrowEvent(wateringRow({ plant_id: undefined })),
    ).toBeNull();
    expect(buildOperatorRootZoneRecordFromGrowEvent(wateringRow({ is_deleted: true }))).toBeNull();
    expect(
      buildOperatorRootZoneRecordFromGrowEvent(wateringRow({ watering_events: [] })),
    ).toBeNull();
    expect(buildOperatorRootZoneRecordsFromRows(null)).toEqual([]);
    expect(buildOperatorRootZoneRecordsFromRows([wateringRow()], 0)).toEqual([]);
  });
});

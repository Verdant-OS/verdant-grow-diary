/**
 * Codex P1 on #2118 at e16cc72e: two backdated watering Quick Logs that share an
 * occurred_at leave their environment rows unpaired in the grouped Timeline, so
 * the main-Timeline correction helper must read each watering's readings from
 * its exact sibling (same created_at as its linked root), never a same-time row.
 */
import { describe, expect, it } from "vitest";
import { correctionValuesForTimelineDiaryEntry } from "@/lib/quick-log/quickLogRevisionRules";

const OCCURRED = "2026-10-10T08:00:00.000Z";

function watering(id: string, rootId: string, volume: number) {
  return {
    id,
    plant_id: "plant-1",
    entry_at: OCCURRED,
    details: {
      event_type: "watering",
      linked_grow_event_id: rootId,
      watering: { volume_ml: volume },
    },
  };
}

const growEvents = [
  {
    id: "root-a",
    event_type: "watering",
    source: "manual",
    plant_id: "plant-1",
    occurred_at: OCCURRED,
    created_at: "2026-10-20T10:00:00.000Z",
  },
  {
    id: "root-b",
    event_type: "watering",
    source: "manual",
    plant_id: "plant-1",
    occurred_at: OCCURRED,
    created_at: "2026-10-20T10:05:00.000Z",
  },
  {
    id: "env-b",
    event_type: "environment",
    source: "manual",
    plant_id: "plant-1",
    occurred_at: OCCURRED,
    created_at: "2026-10-20T10:05:00.000Z",
    environment_events: { temperature_c: 26, humidity_pct: 60, vpd_kpa: 1.3 },
  },
  {
    id: "env-a",
    event_type: "environment",
    source: "manual",
    plant_id: "plant-1",
    occurred_at: OCCURRED,
    created_at: "2026-10-20T10:00:00.000Z",
    environment_events: { temperature_c: 22, humidity_pct: 55, vpd_kpa: 1.1 },
  },
];

describe("tied backdated watering corrections", () => {
  it("gives each watering the readings of its own exact environment sibling", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(watering("d-a", "root-a", 500), growEvents),
    ).toEqual({
      kind: "watering",
      volumeMl: 500,
      sensor: { temperature_c: 22, humidity_pct: 55, vpd_kpa: 1.1 },
    });
    expect(
      correctionValuesForTimelineDiaryEntry(watering("d-b", "root-b", 750), growEvents),
    ).toEqual({
      kind: "watering",
      volumeMl: 750,
      sensor: { temperature_c: 26, humidity_pct: 60, vpd_kpa: 1.3 },
    });
  });

  it("stays volume-only when the root has no exact sibling, even with a same-time row", () => {
    const withoutSiblingA = growEvents.filter((row) => row.id !== "env-a");
    expect(
      correctionValuesForTimelineDiaryEntry(watering("d-a", "root-a", 500), withoutSiblingA),
    ).toEqual({ kind: "watering", volumeMl: 500 });
  });

  it("stays volume-only when the linked root is not loaded", () => {
    const withoutRootA = growEvents.filter((row) => row.id !== "root-a");
    expect(
      correctionValuesForTimelineDiaryEntry(watering("d-a", "root-a", 500), withoutRootA),
    ).toEqual({ kind: "watering", volumeMl: 500 });
  });
});

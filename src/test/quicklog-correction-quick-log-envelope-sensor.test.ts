/**
 * Codex r4297051884: PlantQuickLog V2 writes its diary companion as a
 * "quick_log" envelope linked to an observation root. The Correct dialog must
 * resolve that root's manual environment sibling, as it does for observation
 * rows, and must not offer sensor fields when the root is not an observation.
 */
import { describe, expect, it } from "vitest";
import { correctionValuesForTimelineDiaryEntry } from "@/lib/quick-log/quickLogRevisionRules";

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

const envelope = {
  details: { event_type: "quick_log", linked_grow_event_id: "root-1" },
  plant_id: "plant-1",
  entry_at: OCCURRED,
};

describe("correctionValuesForTimelineDiaryEntry with a quick_log envelope", () => {
  it("resolves the observation root's environment sibling", () => {
    expect(correctionValuesForTimelineDiaryEntry(envelope, rows("observation"))).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.3 },
    });
  });

  it("offers no sensor fields when the linked root is not an observation", () => {
    expect(correctionValuesForTimelineDiaryEntry(envelope, rows("watering"))).toBeNull();
  });

  it("does not fall back to plant and time when the root is not loaded", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(envelope, rows("observation").slice(1)),
    ).toBeNull();
  });

  it("still ignores an unlinked quick_log envelope", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        { ...envelope, details: { event_type: "quick_log" } },
        rows("observation"),
      ),
    ).toBeNull();
  });
});

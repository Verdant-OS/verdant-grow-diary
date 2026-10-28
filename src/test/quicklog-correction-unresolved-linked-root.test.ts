/**
 * #2118 Codex r4326795521: Timeline renders diary rows before the supplemental
 * root lookup finishes (and that lookup can fail). A row whose
 * linked_grow_event_id root is not loaded must not borrow another entry's
 * sensor values through the plant/time matcher.
 */
import { describe, expect, it } from "vitest";
import { correctionValuesForTimelineDiaryEntry } from "@/lib/quick-log/quickLogRevisionRules";

const AT = "2026-10-15T12:00:00.000Z";
const otherEntrySensor = {
  id: "env-other",
  event_type: "environment",
  source: "manual",
  plant_id: "plant-1",
  occurred_at: AT,
  created_at: "2026-10-15T12:00:00.999999+00:00",
  environment_events: { temperature_c: 30, humidity_pct: 40, vpd_kpa: 2.5 },
};

describe("correction values with an unresolved linked root", () => {
  it("offers no sensor fields while the linked observation root is not loaded", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        {
          details: { event_type: "observation", linked_grow_event_id: "root-not-loaded" },
          plant_id: "plant-1",
          entry_at: AT,
        },
        [otherEntrySensor],
      ),
    ).toBeNull();
  });

  it("still uses the plant/time matcher for an unlinked legacy observation", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        { details: { event_type: "observation" }, plant_id: "plant-1", entry_at: AT },
        [otherEntrySensor],
      ),
    ).toEqual({ kind: "sensor", sensor: { temperature_c: 30, humidity_pct: 40, vpd_kpa: 2.5 } });
  });
});

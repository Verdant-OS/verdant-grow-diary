import { describe, expect, it } from "vitest";

import { correctionValuesForTimelineDiaryEntry } from "@/lib/quick-log/quickLogRevisionRules";

const rootId = "bf0a684e-a96e-472c-af8f-e38a54a8332c";
const createdAt = "2026-07-25T13:03:28.412Z";

describe("environment sibling match", () => {
  it("resolves linked_grow_event_id as the observation root, then the environment companion by created_at", () => {
    expect(
      correctionValuesForTimelineDiaryEntry(
        {
          plant_id: "plant-a",
          entry_at: "2026-07-25T13:03:28.000Z",
          details: {
            event_type: "observation",
            source: "manual",
            quick_log_version: 2,
            linked_grow_event_id: rootId,
          },
        },
        [
          {
            id: rootId,
            event_type: "observation",
            source: "manual",
            plant_id: "plant-a",
            occurred_at: "2026-07-25T13:03:28.000Z",
            created_at: createdAt,
          },
          {
            id: "same-instant-other-row",
            event_type: "environment",
            source: "manual",
            plant_id: "plant-a",
            occurred_at: "2026-07-25T13:03:28.000Z",
            created_at: "2026-07-25T13:03:29.000Z",
            environment_events: { temperature_c: 10, humidity_pct: 40, vpd_kpa: 0.4 },
          },
          {
            id: "env-companion",
            event_type: "environment",
            source: "manual",
            plant_id: "plant-b",
            occurred_at: "2026-07-20T08:00:00.000Z",
            created_at: createdAt,
            environment_events: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
          },
        ],
      ),
    ).toEqual({
      kind: "sensor",
      sensor: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    });
  });
});

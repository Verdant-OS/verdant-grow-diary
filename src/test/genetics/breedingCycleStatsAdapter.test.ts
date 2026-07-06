import { describe, it, expect } from "vitest";
import { adaptActionQueueRowsToBreedingCycleTimelinePoints } from "@/lib/genetics/breedingCycleStatsAdapter";

describe("adaptActionQueueRowsToBreedingCycleTimelinePoints", () => {
  it("adapts a well-formed action_queue row into a timeline point", () => {
    const rows = [
      {
        originating_timeline_events: [
          {
            id: "evt-1",
            type: "reversal_application",
            occurred_at: "2026-01-01T00:00:00.000Z",
            source: "manual",
          },
        ],
      },
    ];
    const points = adaptActionQueueRowsToBreedingCycleTimelinePoints(rows);
    expect(points).toEqual([
      { occurredAt: "2026-01-01T00:00:00.000Z", type: "reversal_application" },
    ]);
  });

  it("drops rows with an empty originating_timeline_events array (pre-cutover rows)", () => {
    const rows = [{ originating_timeline_events: [] }, { originating_timeline_events: null }];
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints(rows)).toEqual([]);
  });

  it("drops rows whose type is not a supported breeding event type", () => {
    const rows = [
      {
        originating_timeline_events: [
          {
            id: "evt-1",
            type: "sensor_snapshot",
            occurred_at: "2026-01-01T00:00:00.000Z",
            source: "manual",
          },
        ],
      },
    ];
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints(rows)).toEqual([]);
  });

  it("drops refs with no occurred_at", () => {
    const rows = [
      {
        originating_timeline_events: [{ id: "evt-1", type: "pollination", source: "manual" }],
      },
    ];
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints(rows)).toEqual([]);
  });

  it("takes only the first ref when a row somehow carries more than one", () => {
    const rows = [
      {
        originating_timeline_events: [
          {
            id: "evt-1",
            type: "pollination",
            occurred_at: "2026-01-13T00:00:00.000Z",
            source: "manual",
          },
          {
            id: "evt-2",
            type: "cross_harvest",
            occurred_at: "2026-02-22T00:00:00.000Z",
            source: "manual",
          },
        ],
      },
    ];
    const points = adaptActionQueueRowsToBreedingCycleTimelinePoints(rows);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("pollination");
  });

  it("adapts multiple rows into multiple points, preserving order", () => {
    const rows = [
      {
        originating_timeline_events: [
          {
            id: "evt-1",
            type: "reversal_application",
            occurred_at: "2026-01-01T00:00:00.000Z",
            source: "manual",
          },
        ],
      },
      {
        originating_timeline_events: [
          {
            id: "evt-2",
            type: "pollen_shed_observed",
            occurred_at: "2026-01-10T00:00:00.000Z",
            source: "manual",
          },
        ],
      },
    ];
    const points = adaptActionQueueRowsToBreedingCycleTimelinePoints(rows);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.type)).toEqual(["reversal_application", "pollen_shed_observed"]);
  });

  it("rejects a ref carrying a forbidden field (defense in depth via the shared adapter)", () => {
    const rows = [
      {
        originating_timeline_events: [
          {
            id: "evt-1",
            type: "pollination",
            occurred_at: "2026-01-13T00:00:00.000Z",
            source: "manual",
            service_role: "leak-attempt",
          },
        ],
      },
    ];
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints(rows)).toEqual([]);
  });

  it("returns [] for null/undefined/non-array input without throwing", () => {
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints(null)).toEqual([]);
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints(undefined)).toEqual([]);
    expect(adaptActionQueueRowsToBreedingCycleTimelinePoints("not-an-array" as never)).toEqual([]);
  });
});

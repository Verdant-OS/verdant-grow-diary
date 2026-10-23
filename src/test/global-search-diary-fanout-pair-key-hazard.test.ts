/**
 * Global search diary spec — Timeline fan-out pair-key hazard (requirement 1).
 *
 * `collapseQuickLogSaveFanOut` pairs unlinked manual companions using
 * `(plant_id, instant)` only (`fanOutPairKey`). Timeline always filters to
 * one grow first, so that is safe there. Diary search spans every owned grow,
 * so the implementing RPC must pair on `(grow_id, plant_id, tent_id, instant)`
 * and must not reuse this helper's pair key verbatim.
 */
import { describe, expect, it } from "vitest";

import { collapseQuickLogSaveFanOut } from "@/lib/timelineMergeRules";

const instant = "2026-08-01T12:00:00.000Z";

function manualSpine(input: {
  id: string;
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
}) {
  return {
    id: input.id,
    source: "manual" as const,
    is_deleted: false,
    grow_id: input.grow_id,
    plant_id: input.plant_id ?? null,
    tent_id: input.tent_id ?? null,
    occurred_at: instant,
  };
}

function unlinkedCompanion(input: {
  id: string;
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
}) {
  return {
    id: input.id,
    entry_at: instant,
    grow_id: input.grow_id,
    plant_id: input.plant_id ?? null,
    tent_id: input.tent_id ?? null,
    details: { event_type: "watering" },
  };
}

describe("global search diary fanout pair-key hazard", () => {
  it("collapses two cross-grow null-plant companions onto the first spine at one instant", () => {
    const result = collapseQuickLogSaveFanOut({
      diaryEntries: [
        unlinkedCompanion({ id: "de-grow-a", grow_id: "grow-a", tent_id: "tent-a" }),
        unlinkedCompanion({ id: "de-grow-b", grow_id: "grow-b", tent_id: "tent-b" }),
      ],
      growEvents: [
        manualSpine({ id: "spine-a", grow_id: "grow-a", tent_id: "tent-a" }),
        manualSpine({ id: "spine-b", grow_id: "grow-b", tent_id: "tent-b" }),
      ],
    });

    expect(result.diaryEntries.map((row) => row.id)).toEqual([]);
    expect(result.droppedCompanionsBySpineId.get("spine-a")?.map((row) => row.id)).toEqual([
      "de-grow-a",
      "de-grow-b",
    ]);
    expect(result.droppedCompanionsBySpineId.has("spine-b")).toBe(false);
  });

  it("collapses two tent-level companions in one grow onto one spine when plant is null", () => {
    const result = collapseQuickLogSaveFanOut({
      diaryEntries: [
        unlinkedCompanion({ id: "de-tent-1", grow_id: "grow-1", tent_id: "tent-1" }),
        unlinkedCompanion({ id: "de-tent-2", grow_id: "grow-1", tent_id: "tent-2" }),
      ],
      growEvents: [
        manualSpine({ id: "spine-t1", grow_id: "grow-1", tent_id: "tent-1" }),
        manualSpine({ id: "spine-t2", grow_id: "grow-1", tent_id: "tent-2" }),
      ],
    });

    expect(result.diaryEntries.map((row) => row.id)).toEqual([]);
    expect(result.droppedCompanionsBySpineId.get("spine-t1")?.map((row) => row.id)).toEqual([
      "de-tent-1",
      "de-tent-2",
    ]);
    expect(result.droppedCompanionsBySpineId.has("spine-t2")).toBe(false);
  });
});

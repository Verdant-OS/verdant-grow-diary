/**
 * manualSnapshotTimelineMerge — deterministic merge of diary entries and
 * manual snapshot cards.
 */
import { describe, it, expect } from "vitest";

import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotRecord,
} from "@/lib/manualSensorSnapshotViewModel";
import { mergeTimelineItems } from "@/lib/manualSnapshotTimelineMerge";

function mkCard(id: string, capturedAt: string) {
  const record: ManualSnapshotRecord = {
    id,
    capturedAt,
    tentId: "tent-1",
    plantId: "plant-1",
    notes: null,
    validation: validateManualSnapshot({
      airTemp: 75,
      airTempUnit: "F",
      humidityPct: 55,
    }),
  };
  return buildManualSnapshotTimelineCard(record);
}

describe("mergeTimelineItems", () => {
  it("returns items sorted by occurredAt descending", () => {
    const merged = mergeTimelineItems({
      diaryEntries: [
        { key: "d-old", occurredAt: "2026-01-01T00:00:00.000Z" },
        { key: "d-new", occurredAt: "2026-01-05T00:00:00.000Z" },
      ],
      manualSnapshots: [mkCard("snap-mid", "2026-01-03T00:00:00.000Z")],
    });
    expect(merged.map((m) => m.key)).toEqual(["d-new", "snap-mid", "d-old"]);
  });

  it("breaks ties deterministically by kind then key", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const merged = mergeTimelineItems({
      diaryEntries: [
        { key: "z-diary", occurredAt: ts },
        { key: "a-diary", occurredAt: ts },
      ],
      manualSnapshots: [mkCard("a-snap", ts), mkCard("z-snap", ts)],
    });
    expect(merged.map((m) => `${m.kind}:${m.key}`)).toEqual([
      "diary:a-diary",
      "diary:z-diary",
      "manual-snapshot:a-snap",
      "manual-snapshot:z-snap",
    ]);
  });

  it("returns an empty array when there is nothing to merge", () => {
    expect(
      mergeTimelineItems({ diaryEntries: [], manualSnapshots: [] }),
    ).toEqual([]);
  });

  it("does not invent or relabel diary entries", () => {
    const diary = { key: "d1", occurredAt: "2026-01-01T00:00:00.000Z" };
    const merged = mergeTimelineItems({
      diaryEntries: [diary],
      manualSnapshots: [],
    });
    expect(merged[0].kind).toBe("diary");
    if (merged[0].kind === "diary") {
      expect(merged[0].entry).toBe(diary);
    }
  });
});

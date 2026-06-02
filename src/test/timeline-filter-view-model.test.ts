/**
 * timelineFilterViewModel — chip building + empty-state copy.
 */
import { describe, it, expect } from "vitest";

import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotRecord,
} from "@/lib/manualSensorSnapshotViewModel";
import type {
  TimelineDiaryItem,
  TimelineManualSnapshotItem,
  TimelineMemoryItem,
} from "@/lib/timelineFilterRules";
import {
  buildTimelineFilterChips,
  countTimelineFilterBuckets,
  TIMELINE_FILTER_EMPTY_STATE_COPY,
  TIMELINE_FILTER_RESET_KEY,
} from "@/lib/timelineFilterViewModel";

function diary(overrides: Partial<TimelineDiaryItem> = {}): TimelineDiaryItem {
  return {
    kind: "diary",
    key: overrides.key ?? "d",
    occurredAt: "2026-01-01T10:00:00.000Z",
    eventType: overrides.eventType ?? null,
    hasPhoto: overrides.hasPhoto ?? false,
    note: null,
  };
}

function snap(overrides: Partial<ManualSnapshotRecord> = {}): TimelineManualSnapshotItem {
  const rec: ManualSnapshotRecord = {
    id: overrides.id ?? "snap",
    capturedAt: "2026-01-02T10:00:00.000Z",
    tentId: "t1",
    plantId: "p1",
    notes: null,
    validation:
      overrides.validation ??
      validateManualSnapshot({ airTemp: 75, airTempUnit: "F", humidityPct: 55 }),
  };
  const card = buildManualSnapshotTimelineCard(rec);
  return { kind: "manual_sensor_snapshot", key: card.id, occurredAt: card.capturedAt, card };
}

describe("countTimelineFilterBuckets", () => {
  it("counts each bucket separately and tallies 'all' as item count", () => {
    const items: TimelineMemoryItem[] = [
      diary({ key: "n1" }),
      diary({ key: "w1", eventType: "watering" }),
      snap({ id: "s1" }),
      snap({
        id: "s2",
        validation: validateManualSnapshot({ humidityPct: 200 }),
      }),
    ];
    const counts = countTimelineFilterBuckets(items);
    expect(counts.all).toBe(4);
    expect(counts.watering).toBe(1);
    expect(counts.notes).toBe(1);
    expect(counts.manual_sensor_snapshot).toBe(2);
    expect(counts.warnings).toBe(1);
  });
});

describe("buildTimelineFilterChips", () => {
  it("always includes 'all', and hides buckets with zero count", () => {
    const items: TimelineMemoryItem[] = [snap({ id: "s1" })];
    const chips = buildTimelineFilterChips(items, TIMELINE_FILTER_RESET_KEY);
    const keys = chips.map((c) => c.key);
    expect(keys).toContain("all");
    expect(keys).toContain("manual_sensor_snapshot");
    expect(keys).not.toContain("watering");
    expect(keys).not.toContain("warnings");
  });

  it("marks the selected chip", () => {
    const chips = buildTimelineFilterChips(
      [diary({ eventType: "watering" })],
      "watering",
    );
    const watering = chips.find((c) => c.key === "watering")!;
    expect(watering.selected).toBe(true);
    expect(chips.find((c) => c.key === "all")!.selected).toBe(false);
  });
});

describe("empty state copy", () => {
  it("matches the spec literal", () => {
    expect(TIMELINE_FILTER_EMPTY_STATE_COPY).toBe("No events match this filter.");
  });
});

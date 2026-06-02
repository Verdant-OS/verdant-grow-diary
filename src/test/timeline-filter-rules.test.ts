/**
 * timelineFilterRules — pure classification + predicates.
 */
import { describe, it, expect } from "vitest";

import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotRecord,
} from "@/lib/manualSensorSnapshotViewModel";
import {
  classifyTimelineMemoryItem,
  filterTimelineMemoryItems,
  timelineMemoryItemMatchesFilter,
  type TimelineDiaryItem,
  type TimelineManualSnapshotItem,
  type TimelineMemoryItem,
} from "@/lib/timelineFilterRules";

function diary(overrides: Partial<TimelineDiaryItem> = {}): TimelineDiaryItem {
  return {
    kind: "diary",
    key: overrides.key ?? "d-1",
    occurredAt: overrides.occurredAt ?? "2026-01-01T10:00:00.000Z",
    eventType: overrides.eventType ?? null,
    hasPhoto: overrides.hasPhoto ?? false,
    note: overrides.note ?? null,
    hasWarning: overrides.hasWarning,
  };
}

function manualSnapshot(
  overrides: Partial<ManualSnapshotRecord> = {},
): TimelineManualSnapshotItem {
  const rec: ManualSnapshotRecord = {
    id: overrides.id ?? "snap-1",
    capturedAt: overrides.capturedAt ?? "2026-01-02T10:00:00.000Z",
    tentId: overrides.tentId ?? "tent-1",
    plantId: overrides.plantId ?? "plant-1",
    notes: overrides.notes ?? null,
    validation:
      overrides.validation ??
      validateManualSnapshot({ airTemp: 75, airTempUnit: "F", humidityPct: 55 }),
  };
  const card = buildManualSnapshotTimelineCard(rec);
  return {
    kind: "manual_sensor_snapshot",
    key: card.id,
    occurredAt: card.capturedAt,
    card,
  };
}

describe("classifyTimelineMemoryItem", () => {
  it("classifies manual snapshot cards as manual_sensor_snapshot", () => {
    const buckets = classifyTimelineMemoryItem(manualSnapshot());
    expect(buckets.has("manual_sensor_snapshot")).toBe(true);
    expect(buckets.has("all")).toBe(true);
  });

  it("classifies watering diary entries", () => {
    const buckets = classifyTimelineMemoryItem(diary({ eventType: "watering" }));
    expect(buckets.has("watering")).toBe(true);
  });

  it("classifies feeding diary entries", () => {
    const buckets = classifyTimelineMemoryItem(diary({ eventType: "feeding" }));
    expect(buckets.has("feeding")).toBe(true);
  });

  it("classifies photo-bearing entries as photos", () => {
    const buckets = classifyTimelineMemoryItem(diary({ hasPhoto: true }));
    expect(buckets.has("photos")).toBe(true);
  });

  it("falls back to notes for unknown / null event types", () => {
    const buckets = classifyTimelineMemoryItem(diary({ eventType: "weird-unknown" }));
    expect(buckets.has("notes")).toBe(true);
    expect(buckets.has("all")).toBe(true);
  });

  it("adds warnings bucket for invalid/warning-severity snapshots", () => {
    const warn = manualSnapshot({
      validation: validateManualSnapshot({
        airTemp: 24, // looks like Celsius in °F field → warning
        airTempUnit: "F",
        humidityPct: 50,
      }),
    });
    expect(classifyTimelineMemoryItem(warn).has("warnings")).toBe(true);

    const invalid = manualSnapshot({
      validation: validateManualSnapshot({ humidityPct: 150 }),
    });
    expect(classifyTimelineMemoryItem(invalid).has("warnings")).toBe(true);
  });
});

describe("timelineMemoryItemMatchesFilter", () => {
  const items: TimelineMemoryItem[] = [
    diary({ key: "note-a", eventType: null }),
    diary({ key: "water-a", eventType: "watering" }),
    diary({ key: "feed-a", eventType: "feeding" }),
    diary({ key: "photo-a", hasPhoto: true, eventType: null }),
    manualSnapshot({ id: "snap-ok" }),
    manualSnapshot({
      id: "snap-warn",
      validation: validateManualSnapshot({ humidityPct: 200 }),
    }),
  ];

  it("'all' includes every item", () => {
    expect(filterTimelineMemoryItems(items, "all")).toHaveLength(items.length);
  });

  it("'manual_sensor_snapshot' includes only manual snapshots", () => {
    const out = filterTimelineMemoryItems(items, "manual_sensor_snapshot");
    expect(out.every((i) => i.kind === "manual_sensor_snapshot")).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("'watering' includes only watering diary entries", () => {
    const out = filterTimelineMemoryItems(items, "watering");
    expect(out.map((i) => i.key)).toEqual(["water-a"]);
  });

  it("'photos' includes photo-bearing diary entries", () => {
    const out = filterTimelineMemoryItems(items, "photos");
    expect(out.map((i) => i.key)).toEqual(["photo-a"]);
  });

  it("'warnings' includes snapshots with warning/invalid severity", () => {
    const out = filterTimelineMemoryItems(items, "warnings");
    expect(out.map((i) => i.key)).toEqual(["snap-warn"]);
  });

  it("unknown event types remain visible under 'all'", () => {
    const item = diary({ key: "weird", eventType: "totally-novel-future-event" });
    expect(timelineMemoryItemMatchesFilter(item, "all")).toBe(true);
  });
});

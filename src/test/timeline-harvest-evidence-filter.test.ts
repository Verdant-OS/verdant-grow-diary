/**
 * timeline-harvest-evidence-filter — verifies the new `harvest_evidence`
 * Timeline filter bucket integrates with existing filter rules without
 * breaking the existing filter set.
 */
import { describe, it, expect } from "vitest";

import {
  classifyTimelineMemoryItem,
  filterTimelineMemoryItems,
  TIMELINE_FILTER_KEYS,
  TIMELINE_FILTER_LABELS,
  type TimelineMemoryItem,
} from "@/lib/timelineFilterRules";
import {
  buildTimelineFilterChips,
  countTimelineFilterBuckets,
} from "@/lib/timelineFilterViewModel";

function diary(
  o: Partial<Extract<TimelineMemoryItem, { kind: "diary" }>> = {},
): TimelineMemoryItem {
  return {
    kind: "diary",
    key: o.key ?? "k",
    occurredAt: o.occurredAt ?? "2025-06-01T10:00:00.000Z",
    eventType: o.eventType ?? null,
    hasPhoto: o.hasPhoto ?? false,
    note: o.note ?? null,
    hasWarning: o.hasWarning,
    sensorSnapshot: o.sensorSnapshot,
    photoUrl: o.photoUrl ?? null,
    photos: o.photos,
    plantName: o.plantName ?? null,
    stage: o.stage ?? null,
    earlyStage: o.earlyStage ?? null,
  };
}

describe("Timeline harvest_evidence filter", () => {
  it("exposes the harvest_evidence key and label", () => {
    expect(TIMELINE_FILTER_KEYS).toContain("harvest_evidence");
    expect(TIMELINE_FILTER_LABELS.harvest_evidence).toBe("Harvest evidence");
  });

  it("classifies a diary item with a trichome note into harvest_evidence", () => {
    const item = diary({ note: "Trichome check today", eventType: "observation" });
    const buckets = classifyTimelineMemoryItem(item);
    expect(buckets.has("harvest_evidence")).toBe(true);
    expect(buckets.has("notes")).toBe(true); // existing classification preserved
  });

  it("does NOT classify a watering entry as harvest_evidence", () => {
    const item = diary({ note: "Watered 1L", eventType: "watering" });
    const buckets = classifyTimelineMemoryItem(item);
    expect(buckets.has("harvest_evidence")).toBe(false);
    expect(buckets.has("watering")).toBe(true);
  });

  it("filterTimelineMemoryItems narrows to harvest evidence only", () => {
    const items: TimelineMemoryItem[] = [
      diary({ key: "a", note: "Trichome amber", eventType: "observation" }),
      diary({ key: "b", note: "Watered 1L", eventType: "watering" }),
      diary({
        key: "c",
        note: "Close flower photo top cola",
        hasPhoto: true,
        eventType: "photo",
      }),
    ];
    const filtered = filterTimelineMemoryItems(items, "harvest_evidence");
    expect(filtered.map((i) => (i as { key: string }).key).sort()).toEqual(["a", "c"]);
  });

  it("buildTimelineFilterChips includes a harvest_evidence chip when matches exist", () => {
    const items: TimelineMemoryItem[] = [
      diary({ key: "a", note: "Trichome amber" }),
      diary({ key: "b", note: "Watered", eventType: "watering" }),
    ];
    const chips = buildTimelineFilterChips(items, "all");
    const chip = chips.find((c) => c.key === "harvest_evidence");
    expect(chip).toBeDefined();
    expect(chip!.count).toBe(1);
  });

  it("hides the harvest_evidence chip when no items match (existing chip-hide behavior preserved)", () => {
    const items: TimelineMemoryItem[] = [
      diary({ key: "b", note: "Watered", eventType: "watering" }),
    ];
    const chips = buildTimelineFilterChips(items, "all");
    expect(chips.find((c) => c.key === "harvest_evidence")).toBeUndefined();
  });

  it("countTimelineFilterBuckets seeds harvest_evidence at 0", () => {
    const counts = countTimelineFilterBuckets([]);
    expect(counts.harvest_evidence).toBe(0);
  });
});

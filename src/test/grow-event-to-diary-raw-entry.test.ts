/**
 * growEventToDiaryRawEntry — pure mapper + companion-enrichment tests.
 *
 * mergeTimelineSources deliberately keeps the grow_events side when it
 * logically dedups against a diary_entries mirror (grow_events is the live
 * entry path), but grow_events has no photo_url/details columns. These tests
 * cover the enrichment that restores the companion's photo_url/details onto
 * the surviving mapped entry so a Photo/Training save's payload doesn't
 * vanish the moment its diary mirror is suppressed as a duplicate.
 */
import { describe, it, expect } from "vitest";
import {
  mapGrowEventToRecentRawEntry,
  mapGrowEventsToRecentRawEntries,
  enrichRecentRawEntryWithDiaryCompanion,
} from "@/lib/growEventToDiaryRawEntry";

describe("mapGrowEventToRecentRawEntry", () => {
  it("maps a grow_events row into the loose raw-entry shape", () => {
    const row = mapGrowEventToRecentRawEntry({
      id: "g1",
      grow_id: "grow-1",
      plant_id: "plant-1",
      tent_id: "tent-1",
      event_type: "training",
      occurred_at: "2026-06-19T12:00:00Z",
      note: "topped the main cola",
      source: "manual",
    });
    expect(row).toEqual({
      id: "g1",
      grow_id: "grow-1",
      plant_id: "plant-1",
      tent_id: "tent-1",
      entry_type: "training",
      entry_at: "2026-06-19T12:00:00Z",
      note: "topped the main cola",
      details: { event_type: "training", source: "manual" },
    });
  });
});

describe("mapGrowEventsToRecentRawEntries", () => {
  it("filters out deleted rows and rows missing id/occurred_at", () => {
    const rows = mapGrowEventsToRecentRawEntries([
      { id: "g1", event_type: "watering", occurred_at: "2026-06-19T12:00:00Z" },
      { id: "g2", event_type: "watering", occurred_at: "2026-06-19T13:00:00Z", is_deleted: true },
      { id: "", event_type: "watering", occurred_at: "2026-06-19T14:00:00Z" },
      { id: "g4", event_type: "watering", occurred_at: "" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["g1"]);
  });
});

describe("enrichRecentRawEntryWithDiaryCompanion", () => {
  const mapped = mapGrowEventToRecentRawEntry({
    id: "g1",
    grow_id: "grow-1",
    event_type: "photo",
    occurred_at: "2026-06-19T12:00:00Z",
    note: "(quick log)",
    source: "manual",
  });

  it("carries the companion's photo_url onto the surviving grow_events-mapped entry", () => {
    const enriched = enrichRecentRawEntryWithDiaryCompanion(mapped, {
      photo_url: "https://signed.example.com/a.jpg",
      details: { event_type: "photo", subject: "buds", caption: "week 6" },
    });
    expect(enriched.photo_url).toBe("https://signed.example.com/a.jpg");
    expect(enriched.details.subject).toBe("buds");
    expect(enriched.details.caption).toBe("week 6");
  });

  it("the mapper's own event_type/source stay authoritative over the companion's details", () => {
    // Companion details carries a stale/foreign event_type -- the mapper's
    // own grow_events-derived value must win, not be silently overwritten.
    const enriched = enrichRecentRawEntryWithDiaryCompanion(mapped, {
      photo_url: null,
      details: { event_type: "observation", source: "stale" },
    });
    expect(enriched.details.event_type).toBe("photo");
    expect(enriched.details.source).toBe("manual");
  });

  it("returns photo_url: null (not undefined, not a crash) when there is no companion", () => {
    const enriched = enrichRecentRawEntryWithDiaryCompanion(mapped, null);
    expect(enriched.photo_url).toBeNull();
    expect(enriched.details).toEqual(mapped.details);
  });

  it("returns photo_url: null when the companion exists but has no photo", () => {
    const enriched = enrichRecentRawEntryWithDiaryCompanion(mapped, {
      details: { event_type: "training", technique: "lst" },
    });
    expect(enriched.photo_url).toBeNull();
    expect(enriched.details.technique).toBe("lst");
  });
});

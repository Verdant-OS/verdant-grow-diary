/**
 * timelineEvidenceFilterRules — pure helper tests.
 *
 * Covers: keyword search (case-insensitive, trimmed), plant/tent/log-type
 * filters, combined narrowing, clear restores all, original ordering,
 * results count, derived options, and safety scope of search fields.
 */
import { describe, it, expect } from "vitest";
import {
  deriveTimelineEventTypeOptions,
  deriveTimelinePlantOptions,
  deriveTimelineTentOptions,
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
  timelineEvidenceRowMatches,
  TIMELINE_EVIDENCE_EMPTY_DESC,
  TIMELINE_EVIDENCE_SEARCH_PLACEHOLDER,
} from "@/lib/timelineEvidenceFilterRules";

const ROWS = [
  {
    id: "r1",
    note: "Watered with 500ml",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    details: { event_type: "watering", plant_name: "Blue Dream" },
  },
  {
    id: "r2",
    note: "Fed nutrients today",
    stage: "veg",
    plant_id: "p2",
    tent_id: "t1",
    details: { event_type: "feeding", plant_name: "Northern Lights" },
  },
  {
    id: "r3",
    note: "Took a photo of leaf yellowing",
    stage: "flower",
    plant_id: "p1",
    tent_id: "t2",
    details: { event_type: "note", plant_name: "Blue Dream" },
  },
  {
    id: "r4",
    note: null,
    stage: null,
    plant_id: null,
    tent_id: null,
    details: null,
  },
];

describe("filterTimelineEvidenceRows — empty input", () => {
  it("returns all rows when no filters are active", () => {
    const out = filterTimelineEvidenceRows(ROWS, {});
    expect(out.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4"]);
  });
  it("returns [] for empty input array", () => {
    expect(filterTimelineEvidenceRows([], { query: "x" })).toEqual([]);
  });
});

describe("keyword search", () => {
  it("matches case-insensitively against note text", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "WATERED" });
    expect(out.map((r) => r.id)).toEqual(["r1"]);
  });
  it("trims whitespace from query", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "   nutrients   " });
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });
  it("matches plant name from details", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "blue dream" });
    expect(out.map((r) => r.id)).toEqual(["r1", "r3"]);
  });
  it("matches event_type token", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "feeding" });
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });
  it("empty/whitespace query is a no-op", () => {
    expect(filterTimelineEvidenceRows(ROWS, { query: "   " })).toHaveLength(4);
  });
});

describe("dimension filters", () => {
  it("plant filter narrows to that plant id", () => {
    expect(
      filterTimelineEvidenceRows(ROWS, { plantId: "p1" }).map((r) => r.id),
    ).toEqual(["r1", "r3"]);
  });
  it("tent filter narrows to that tent id", () => {
    expect(
      filterTimelineEvidenceRows(ROWS, { tentId: "t1" }).map((r) => r.id),
    ).toEqual(["r1", "r2"]);
  });
  it("log type filter narrows to that event_type", () => {
    expect(
      filterTimelineEvidenceRows(ROWS, { eventType: "note" }).map((r) => r.id),
    ).toEqual(["r3"]);
  });
  it("combined filters AND-narrow results", () => {
    expect(
      filterTimelineEvidenceRows(ROWS, {
        plantId: "p1",
        tentId: "t1",
        eventType: "watering",
        query: "500",
      }).map((r) => r.id),
    ).toEqual(["r1"]);
  });
  it("preserves original row ordering", () => {
    const reordered = [ROWS[2], ROWS[0], ROWS[1], ROWS[3]];
    const out = filterTimelineEvidenceRows(reordered, { plantId: "p1" });
    expect(out.map((r) => r.id)).toEqual(["r3", "r1"]);
  });
});

describe("safe search scope", () => {
  it("does NOT search raw_payload or secret-like detail blobs", () => {
    const rows = [
      {
        id: "x",
        note: "safe note",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: {
          event_type: "note",
          raw_payload: { PASSKEY: "vbt_supersecret", Authorization: "Bearer abc" },
          ingest_url: "https://bridge.example.com/?PASSKEY=vbt_xyz",
        },
      },
    ];
    expect(
      filterTimelineEvidenceRows(rows, { query: "PASSKEY" }),
    ).toHaveLength(0);
    expect(
      filterTimelineEvidenceRows(rows, { query: "vbt_" }),
    ).toHaveLength(0);
    expect(
      filterTimelineEvidenceRows(rows, { query: "Bearer" }),
    ).toHaveLength(0);
    expect(
      filterTimelineEvidenceRows(rows, { query: "bridge.example.com" }),
    ).toHaveLength(0);
    // The safe field still matches.
    expect(
      filterTimelineEvidenceRows(rows, { query: "safe note" }),
    ).toHaveLength(1);
  });
});

describe("isTimelineEvidenceFilterActive", () => {
  it("false for empty input", () => {
    expect(isTimelineEvidenceFilterActive({})).toBe(false);
    expect(isTimelineEvidenceFilterActive({ query: "  " })).toBe(false);
  });
  it("true when any dimension is set", () => {
    expect(isTimelineEvidenceFilterActive({ query: "x" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ plantId: "p" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ tentId: "t" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ eventType: "n" })).toBe(true);
  });
});

describe("derived option lists", () => {
  it("deriveTimelinePlantOptions groups + sorts by label", () => {
    const opts = deriveTimelinePlantOptions(ROWS);
    expect(opts.map((o) => o.id)).toEqual(["p1", "p2"]);
    expect(opts[0]).toMatchObject({ label: "Blue Dream", count: 2 });
    expect(opts[1]).toMatchObject({ label: "Northern Lights", count: 1 });
  });
  it("deriveTimelineTentOptions falls back to id slice when no name map", () => {
    const opts = deriveTimelineTentOptions(ROWS);
    expect(opts.map((o) => o.id).sort()).toEqual(["t1", "t2"]);
    expect(opts.find((o) => o.id === "t1")?.label).toMatch(/^Tent /);
  });
  it("deriveTimelineTentOptions uses provided name map", () => {
    const names = new Map<string, string>([
      ["t1", "Veg Tent"],
      ["t2", "Flower Tent"],
    ]);
    const opts = deriveTimelineTentOptions(ROWS, names);
    expect(opts).toEqual([
      { id: "t2", label: "Flower Tent", count: 1 },
      { id: "t1", label: "Veg Tent", count: 2 },
    ]);
  });
  it("deriveTimelineEventTypeOptions enumerates distinct event types", () => {
    const opts = deriveTimelineEventTypeOptions(ROWS);
    expect(opts.map((o) => o.id)).toEqual(["feeding", "note", "watering"]);
  });
});

describe("timelineEvidenceRowMatches — direct predicate", () => {
  it("returns false for null/undefined row", () => {
    expect(
      timelineEvidenceRowMatches(
        null as unknown as Parameters<typeof timelineEvidenceRowMatches>[0],
        { query: "x" },
      ),
    ).toBe(false);
  });
});

describe("exported copy", () => {
  it("placeholder and empty copy are stable", () => {
    expect(TIMELINE_EVIDENCE_SEARCH_PLACEHOLDER).toBe("Search timeline");
    expect(TIMELINE_EVIDENCE_EMPTY_DESC).toBe(
      "No timeline entries match these filters.",
    );
  });
});

/**
 * Timeline keyword search must match nutrient product names on Feed entries
 * (production QA 2026-10-14: "FloraGro" and "General Hydroponics" returned 0
 * of 6 while note text matched). Only product name strings from the Quick
 * Log feeding envelope are searched; other nested detail values stay out.
 */
import { describe, it, expect } from "vitest";
import { filterTimelineEvidenceRows } from "@/lib/timelineEvidenceFilterRules";

const FEED = {
  id: "feed-1",
  note: "(quick log)",
  stage: null,
  plant_id: null,
  tent_id: "tent-1",
  details: {
    event_type: "feeding",
    feeding: {
      line_id: "default",
      volume_ml: 1200,
      products: [
        { name: "FloraGro", amount: 2.5, unit: "ml_per_l" },
        { name: "General Hydroponics FloraMicro", amount: 1.5, unit: "ml_per_l" },
      ],
    },
  },
};

const NOTE = {
  id: "note-1",
  note: "leaf curl on the top canopy",
  stage: null,
  plant_id: null,
  tent_id: "tent-1",
  details: { event_type: "note" },
};

const ids = (query: string) =>
  filterTimelineEvidenceRows([FEED, NOTE], { query }).map((row) => row.id);

describe("Timeline search over Feed product names", () => {
  it("matches a nutrient product name, case-insensitively", () => {
    expect(ids("FloraGro")).toEqual(["feed-1"]);
    expect(ids("general hydroponics")).toEqual(["feed-1"]);
  });

  it("still matches note text and nothing else", () => {
    expect(ids("leaf curl")).toEqual(["note-1"]);
    expect(ids("zzz-no-match")).toEqual([]);
  });

  it("does not search non-name feeding fields or malformed products", () => {
    expect(ids("ml_per_l")).toEqual([]);
    expect(ids("default")).toEqual([]);
    const odd = {
      ...FEED,
      id: "feed-odd",
      details: { feeding: { products: [null, 7, { name: 42 }, { name: "  " }, "FloraBloom"] } },
    };
    expect(filterTimelineEvidenceRows([odd], { query: "florabloom" })).toEqual([]);
  });
});

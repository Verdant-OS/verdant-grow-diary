import { describe, expect, it } from "vitest";
import {
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
  timelineEvidenceRowMatches,
} from "@/lib/timelineEvidenceFilterRules";

const ROWS = [
  {
    id: "qa-1",
    note: "QA Test leaf observation",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    details: { event_type: "observation", plant_name: "QA Test Plant" },
  },
  {
    id: "qa-2",
    note: 'Logged "QA Test" with literal quotes in note',
    stage: "flower",
    plant_id: "p2",
    tent_id: "t1",
    details: { event_type: "note", plant_name: "Blue Dream" },
  },
  {
    id: "other-1",
    note: "QA only without the second word",
    stage: "veg",
    plant_id: "p3",
    tent_id: "t1",
    details: { event_type: "note", plant_name: "Northern Lights" },
  },
];

describe("Timeline quoted phrase search (#2164)", () => {
  it("matches entries when the search query is wrapped in straight double quotes", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: '"QA Test"' });
    expect(out.map((r) => r.id)).toEqual(["qa-1", "qa-2"]);
  });

  it("matches entries when the search query is wrapped in single or curly quotes", () => {
    expect(filterTimelineEvidenceRows(ROWS, { query: "'QA Test'" }).map((r) => r.id)).toEqual([
      "qa-1",
      "qa-2",
    ]);
    expect(filterTimelineEvidenceRows(ROWS, { query: "“QA Test”" }).map((r) => r.id)).toEqual([
      "qa-1",
      "qa-2",
    ]);
  });

  it("handles leading/trailing whitespace and unmatched quotes gracefully", () => {
    expect(filterTimelineEvidenceRows(ROWS, { query: '  "QA Test"  ' }).map((r) => r.id)).toEqual([
      "qa-1",
      "qa-2",
    ]);
    expect(filterTimelineEvidenceRows(ROWS, { query: '"QA Test' }).map((r) => r.id)).toEqual([
      "qa-1",
      "qa-2",
    ]);
  });

  it("treats quote-only queries as empty (no filter active, all rows returned)", () => {
    expect(isTimelineEvidenceFilterActive({ query: '""' })).toBe(false);
    expect(isTimelineEvidenceFilterActive({ query: "''" })).toBe(false);
    expect(filterTimelineEvidenceRows(ROWS, { query: '""' })).toHaveLength(3);
    expect(timelineEvidenceRowMatches(ROWS[0], { query: '""' })).toBe(true);
  });
});

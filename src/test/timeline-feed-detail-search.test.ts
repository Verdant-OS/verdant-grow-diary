import { describe, expect, it } from "vitest";
import { filterTimelineEvidenceRows } from "@/lib/timelineEvidenceFilterRules";

const feed = {
  id: "feed-1",
  note: "Runoff looked high and a leaf curl showed up.",
  stage: "veg",
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-10-14T15:00:00.000Z",
  details: {
    event_type: "feeding",
    feeding: {
      line_id: "base",
      products: [{ name: "FloraGro", brand: "General Hydroponics", amount: 5, unit: "ml" }],
    },
    manual_provenance: {
      source: "manual",
      transport: "internal-only-token",
    },
    sensor_snapshot: {
      metrics: { label: "do-not-index-snapshot" },
    },
  },
};

describe("timeline feed detail search", () => {
  it("matches the nutrient product name and brand", () => {
    expect(filterTimelineEvidenceRows([feed], { query: "FloraGro" }).map((row) => row.id)).toEqual([
      "feed-1",
    ]);
    expect(
      filterTimelineEvidenceRows([feed], { query: "General Hydroponics" }).map((row) => row.id),
    ).toEqual(["feed-1"]);
  });

  it("still matches the note text", () => {
    expect(filterTimelineEvidenceRows([feed], { query: "runoff" }).map((row) => row.id)).toEqual([
      "feed-1",
    ]);
    expect(filterTimelineEvidenceRows([feed], { query: "leaf curl" }).map((row) => row.id)).toEqual(
      ["feed-1"],
    );
  });

  it("does not index internal provenance or sensor snapshot payloads", () => {
    expect(
      filterTimelineEvidenceRows([feed], { query: "internal-only-token" }).map((row) => row.id),
    ).toEqual([]);
    expect(
      filterTimelineEvidenceRows([feed], { query: "do-not-index-snapshot" }).map((row) => row.id),
    ).toEqual([]);
  });
});

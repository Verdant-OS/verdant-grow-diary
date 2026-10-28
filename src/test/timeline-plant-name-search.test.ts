/**
 * A plant name shown from the directory must also match Timeline keyword search
 * when the diary row has plant_id and no details.plant_name.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterTimelineEvidenceRows } from "@/lib/timelineEvidenceFilterRules";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

describe("timeline search includes the resolved plant name", () => {
  it("keeps a card whose plant name comes only from the directory", () => {
    const kept = filterTimelineEvidenceRows(
      [
        {
          id: "row-1",
          note: "watered",
          stage: "vegetative",
          plant_id: "plant-1",
          tent_id: null,
          details: { event_type: "watering" },
        },
      ],
      {
        query: "Blue Dream",
        plantNamesById: new Map([["plant-1", "Blue Dream"]]),
      },
    );
    expect(kept.map((row) => row.id)).toEqual(["row-1"]);
  });

  it("passes the plant directory into the timeline evidence filter", () => {
    expect(TIMELINE).toMatch(/evidenceFilterInput = \{[^}]*plantNamesById/);
  });
});

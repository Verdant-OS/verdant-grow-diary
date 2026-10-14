/**
 * A tent name shown from the directory must also match Timeline keyword search
 * when the diary row has tent_id and no details.tent_name.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterTimelineEvidenceRows } from "@/lib/timelineEvidenceFilterRules";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

const ROW = {
  id: "row-1",
  note: "QA text note: leaves look healthy",
  stage: null,
  plant_id: null,
  tent_id: "tent-1",
  details: { event_type: "note" },
};

describe("timeline search includes the resolved tent name", () => {
  it("keeps rows whose tent name comes only from the directory", () => {
    const kept = filterTimelineEvidenceRows([ROW], {
      query: "QA Tent Alpha",
      tentNamesById: new Map([["tent-1", "QA Tent Alpha"]]),
    });
    expect(kept.map((row) => row.id)).toEqual(["row-1"]);
  });

  it("passes the tent directory into the timeline evidence filter", () => {
    expect(TIMELINE).toMatch(/evidenceFilterInput = \{[^}]*tentNamesById/);
  });
});

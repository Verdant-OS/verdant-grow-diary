import { describe, expect, it } from "vitest";
import { deriveTimelineEventTypeOptions } from "@/lib/timelineEvidenceFilterRules";

describe("timeline unknown log-type separator labels", () => {
  it("keeps unknown tokens that differ only by separator on distinct filter labels", () => {
    const options = deriveTimelineEventTypeOptions([
      {
        id: "row-underscore",
        note: "underscore token",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: { event_type: "custom_type" },
      },
      {
        id: "row-hyphen",
        note: "hyphen token",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: { event_type: "custom-type" },
      },
    ]);

    expect(options.map((option) => option.id).sort()).toEqual(["custom-type", "custom_type"]);
    expect(new Set(options.map((option) => option.label)).size).toBe(options.length);
    expect(options.map((option) => option.label)).toEqual([
      "Custom Type (custom_type)",
      "Custom Type (custom-type)",
    ]);
  });
});

/**
 * The Timeline log-type filter must show a grower-facing label.
 * Machine event keys such as quicklog_photo_attachment stay the option value
 * so filtering still matches the stored token.
 */
import { describe, expect, it } from "vitest";
import {
  deriveTimelineEventTypeOptions,
  timelineEventTypeOptionLabel,
} from "@/lib/timelineEvidenceFilterRules";

describe("timeline log-type filter labels", () => {
  it("labels a photo attachment instead of the raw event key", () => {
    expect(timelineEventTypeOptionLabel("quicklog_photo_attachment")).toBe("Photo");
    const opts = deriveTimelineEventTypeOptions([
      {
        id: "p1",
        note: "Photo attached from Quick Log.",
        stage: null,
        plant_id: null,
        tent_id: "tent-1",
        details: { event_type: "quicklog_photo_attachment" },
      },
    ]);
    expect(opts).toEqual([{ id: "quicklog_photo_attachment", label: "Photo", count: 1 }]);
  });

  it("keeps known care types readable and does not invent a count", () => {
    expect(timelineEventTypeOptionLabel("watering")).toBe("Watering");
    expect(timelineEventTypeOptionLabel("note")).toBe("Note");
  });
});

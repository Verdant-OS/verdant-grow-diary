import { describe, expect, it } from "vitest";
import { dropBlankQuickLogPlaceholderRows } from "@/lib/timelineQuickLogPlaceholderDedupeRules";

const OBJECT_PATH = "owner-1/grow-a/leaf.jpg";

describe("quick-log dedupe across accumulated timeline pages", () => {
  it("drops a signed mirror once the photo from the other page is in the same row set", () => {
    const photo = {
      id: "photo-page-1",
      note: "Photo attached from Quick Log.",
      photo_url: "https://signed.test/page-1.jpg?token=abc",
      photo_object_path: OBJECT_PATH,
      plant_id: "plant-1",
      tent_id: "tent-1",
      entry_at: "2026-10-14T14:47:00.000Z",
      details: { event_type: "quicklog_photo_attachment", source: "manual" },
    };
    const mirror = {
      id: "blank-page-2",
      note: "(quick log)",
      photo_url: "https://signed.test/page-2.jpg?token=abc",
      photo_object_path: OBJECT_PATH,
      plant_id: "plant-1",
      tent_id: "tent-1",
      entry_at: "2026-10-14T14:46:30.000Z",
      details: {
        event_type: "observation",
        source: "manual",
        linked_grow_event_id: "event-1",
        photo_url: OBJECT_PATH,
      },
    };

    expect(dropBlankQuickLogPlaceholderRows([photo]).map((row) => row.id)).toEqual([
      "photo-page-1",
    ]);
    expect(dropBlankQuickLogPlaceholderRows([mirror]).map((row) => row.id)).toEqual([
      "blank-page-2",
    ]);
    expect(dropBlankQuickLogPlaceholderRows([photo, mirror]).map((row) => row.id)).toEqual([
      "photo-page-1",
    ]);
  });
});

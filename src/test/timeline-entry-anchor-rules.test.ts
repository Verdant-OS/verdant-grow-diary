import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildLinkedGrowEventTimelineAnchorId,
  buildTimelineEntryAnchorId,
} from "@/lib/timelineEntryAnchorRules";

describe("timeline entry anchor rules", () => {
  it("builds stable anchors only for safe non-empty ids", () => {
    expect(buildTimelineEntryAnchorId("grow-event-123")).toBe("timeline-entry-grow-event-123");
    expect(buildTimelineEntryAnchorId("  ")).toBeNull();
    expect(buildTimelineEntryAnchorId("bad/id")).toBeNull();
  });

  it("prefers the current linked grow-event identity and supports the legacy key", () => {
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        linked_grow_event_id: "linked-123",
        grow_event_id: "legacy-456",
      }),
    ).toBe("timeline-entry-linked-123");
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        grow_event_id: "legacy-456",
      }),
    ).toBe("timeline-entry-legacy-456");
  });

  it("fails closed for missing, malformed, and object-shaped details", () => {
    expect(buildLinkedGrowEventTimelineAnchorId(null)).toBeNull();
    expect(buildLinkedGrowEventTimelineAnchorId({})).toBeNull();
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        linked_grow_event_id: { id: "private-object" },
      }),
    ).toBeNull();
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        linked_grow_event_id: "bad/id",
      }),
    ).toBeNull();
  });

  it("wires the linked grow-event alias onto each visible Timeline row", () => {
    const timelineSource = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");
    expect(timelineSource).toContain("buildLinkedGrowEventTimelineAnchorId(e.details)");
    expect(timelineSource).toContain("data-timeline-entry-alias-for={primaryAnchorId}");
  });
});

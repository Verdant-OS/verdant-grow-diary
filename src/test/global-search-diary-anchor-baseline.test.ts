/**
 * Global search diary spec — Timeline spine hash aliases (docs/specs/global-search-diary-entries.md requirement 2).
 *
 * Explicit linked companions already expose a spine-id alias from details.
 * Search navigation must stay aligned with `buildLinkedGrowEventTimelineAnchorId`.
 */
import { describe, expect, it } from "vitest";

import {
  buildLinkedGrowEventTimelineAnchorId,
  buildTimelineEntryAnchorId,
} from "@/lib/timelineEntryAnchorRules";

describe("global search diary anchor baseline", () => {
  it("builds timeline-entry-<id> anchors for diary row ids", () => {
    expect(buildTimelineEntryAnchorId("abc-123")).toBe("timeline-entry-abc-123");
    expect(buildTimelineEntryAnchorId("")).toBeNull();
  });

  it("prefers details linked_grow_event_id over grow_event_id for spine aliases", () => {
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        linked_grow_event_id: "Spine-Modern",
        grow_event_id: "Spine-Legacy",
      }),
    ).toBe("timeline-entry-Spine-Modern");
  });

  it("falls back to grow_event_id when linked_grow_event_id is absent", () => {
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        grow_event_id: "Spine-Legacy",
      }),
    ).toBe("timeline-entry-Spine-Legacy");
  });

  it("returns null for non-object details", () => {
    expect(buildLinkedGrowEventTimelineAnchorId(null)).toBeNull();
    expect(buildLinkedGrowEventTimelineAnchorId("linked")).toBeNull();
  });
});

/**
 * Global search diary spec — Timeline spine alias baseline (requirement 2).
 *
 * Collapsed diary navigation uses the same preferred link order as Timeline.
 * The implementing slice must canonicalize alias ids; this locks today's picker.
 */
import { describe, expect, it } from "vitest";

import {
  buildLinkedGrowEventTimelineAnchorId,
  buildTimelineEntryAnchorId,
} from "@/lib/timelineEntryAnchorRules";

describe("global search diary anchor baseline", () => {
  it("builds timeline-entry-<id> anchors from entry ids", () => {
    expect(buildTimelineEntryAnchorId("abc-123")).toBe("timeline-entry-abc-123");
  });

  it("prefers details.linked_grow_event_id over grow_event_id for spine aliases", () => {
    const anchor = buildLinkedGrowEventTimelineAnchorId({
      linked_grow_event_id: "Spine-Modern",
      grow_event_id: "spine-legacy",
    });
    expect(anchor).toBe("timeline-entry-Spine-Modern");
  });

  it("uses grow_event_id only when no modern link is present", () => {
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        grow_event_id: "11111111-2222-3333-4444-555555555555",
      }),
    ).toBe("timeline-entry-11111111-2222-3333-4444-555555555555");
  });
});

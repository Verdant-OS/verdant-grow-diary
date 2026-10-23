/**
 * Global search diary spec — Timeline anchor casing hazard (requirement 2).
 *
 * `buildLinkedGrowEventTimelineAnchorId` preserves link spelling from details.
 * Search returns canonical lowercase spine ids; `getElementById` is
 * case-sensitive, so the implementing slice must normalize aliases.
 */
import { describe, expect, it } from "vitest";

import { buildLinkedGrowEventTimelineAnchorId } from "@/lib/timelineEntryAnchorRules";

describe("global search diary anchor casing hazard", () => {
  it("builds an alias with the raw uppercase linked_grow_event_id text", () => {
    const upper = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890";
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        linked_grow_event_id: upper,
      }),
    ).toBe(`timeline-entry-${upper}`);
    expect(
      buildLinkedGrowEventTimelineAnchorId({
        linked_grow_event_id: upper,
      }),
    ).not.toBe(`timeline-entry-${upper.toLowerCase()}`);
  });
});

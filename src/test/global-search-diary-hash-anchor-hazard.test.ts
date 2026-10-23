/**
 * Global search diary spec — hash anchor hazards (requirement 2).
 *
 * Search navigation must land on a canonical lowercase spine id while legacy
 * JSON link text may be uppercase. Unlinked manual companions only get a diary
 * id anchor today; the implementing slice must add a spine alias for paired rows.
 */
import { describe, expect, it } from "vitest";

import {
  buildLinkedGrowEventTimelineAnchorId,
  buildTimelineEntryAnchorId,
} from "@/lib/timelineEntryAnchorRules";

const canonicalSpineId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("global search diary hash anchor hazard", () => {
  it("builds a spine alias from uppercase linked_grow_event_id text as-is (getElementById is case-sensitive)", () => {
    const uppercase = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
    expect(buildLinkedGrowEventTimelineAnchorId({ linked_grow_event_id: uppercase })).toBe(
      `timeline-entry-${uppercase}`,
    );
    expect(buildLinkedGrowEventTimelineAnchorId({ linked_grow_event_id: uppercase })).not.toBe(
      buildTimelineEntryAnchorId(canonicalSpineId),
    );
  });

  it("does not synthesize a spine alias for an unlinked companion (diary id only)", () => {
    expect(buildLinkedGrowEventTimelineAnchorId({ event_type: "watering" })).toBeNull();
    expect(buildTimelineEntryAnchorId("de-unlinked")).toBe("timeline-entry-de-unlinked");
  });
});

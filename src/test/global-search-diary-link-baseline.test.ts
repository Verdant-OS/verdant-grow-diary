/**
 * Global search diary spec — grow-event link resolution (docs/specs/global-search-diary-entries.md requirement 1).
 *
 * Diary/spine pairing for search must mirror Timeline's `pickLogicalGrowEventLink`
 * order. A wrong link breaks dedupe, deleted-spine exclusion, and tuple fallback.
 */
import { describe, expect, it } from "vitest";

import { pickLogicalGrowEventLink } from "@/lib/timelineMergeRules";

describe("global search diary link baseline — pickLogicalGrowEventLink", () => {
  it("returns null when no link field is a non-empty string", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d1",
        details: { linked_grow_event_id: "", grow_event_id: null },
      }),
    ).toBeNull();
  });

  it("prefers row linked_grow_event_id over every other candidate", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d1",
        linked_grow_event_id: "row-modern",
        grow_event_id: "row-legacy",
        details: {
          linked_grow_event_id: "details-modern",
          grow_event_id: "details-legacy",
        },
      }),
    ).toBe("row-modern");
  });

  it("prefers row grow_event_id over details-only links", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d1",
        grow_event_id: "row-legacy",
        details: { linked_grow_event_id: "details-modern" },
      }),
    ).toBe("row-legacy");
  });

  it("prefers details linked_grow_event_id over details grow_event_id", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d1",
        details: {
          linked_grow_event_id: "details-modern",
          grow_event_id: "details-legacy",
        },
      }),
    ).toBe("details-modern");
  });

  it("does not fall back to grow_event_id when linked_grow_event_id is present but unusable", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d1",
        details: {
          linked_grow_event_id: "not-a-uuid",
          grow_event_id: "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    ).toBe("not-a-uuid");
  });

  it("uses details grow_event_id when no earlier candidate is set", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d1",
        details: { grow_event_id: "legacy-only" },
      }),
    ).toBe("legacy-only");
  });
});

/**
 * Global search diary spec — Timeline link picker baseline (requirement 1).
 *
 * Diary/spine collapse must use the same preferred link as Timeline
 * (`pickLogicalGrowEventLink`). A malformed modern link must not fall back to
 * the legacy key; search would pair the wrong spine or suppress a standalone row.
 */
import { describe, expect, it } from "vitest";

import { pickLogicalGrowEventLink } from "@/lib/timelineMergeRules";

describe("global search diary pickLogicalGrowEventLink baseline", () => {
  it("prefers the top-level linked_grow_event_id column over every details key", () => {
    const link = pickLogicalGrowEventLink({
      id: "d0",
      linked_grow_event_id: "99999999-8888-7777-6666-555555555555",
      details: {
        linked_grow_event_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        grow_event_id: "11111111-2222-3333-4444-555555555555",
      },
    });
    expect(link).toBe("99999999-8888-7777-6666-555555555555");
  });

  it("prefers details.linked_grow_event_id over details.grow_event_id", () => {
    const link = pickLogicalGrowEventLink({
      id: "d1",
      details: {
        linked_grow_event_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        grow_event_id: "11111111-2222-3333-4444-555555555555",
      },
    });
    expect(link).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("does not fall back to legacy grow_event_id when modern link is present but unusable", () => {
    const link = pickLogicalGrowEventLink({
      id: "d2",
      details: {
        linked_grow_event_id: "not-a-uuid",
        grow_event_id: "11111111-2222-3333-4444-555555555555",
      },
    });
    expect(link).toBe("not-a-uuid");
  });

  it("uses legacy grow_event_id only when no non-empty preferred link exists", () => {
    expect(
      pickLogicalGrowEventLink({
        id: "d3",
        details: { grow_event_id: "11111111-2222-3333-4444-555555555555" },
      }),
    ).toBe("11111111-2222-3333-4444-555555555555");

    expect(
      pickLogicalGrowEventLink({
        id: "d4",
        details: { linked_grow_event_id: "", grow_event_id: "legacy-only" },
      }),
    ).toBe("legacy-only");
  });
});

/**
 * Global search diary spec — grow-event link precedence baseline (requirement 1).
 *
 * Diary/spine dedupe must follow the same preferred link as Timeline:
 * `pickLogicalGrowEventLink` in `timelineMergeRules.ts`. Search adds owner/grow
 * validation and must not fall back to a legacy key when the modern link is present
 * but unusable — these tests lock the helper's pick order only.
 */
import { describe, expect, it } from "vitest";

import { pickLogicalGrowEventLink } from "@/lib/timelineMergeRules";

describe("global search diary link precedence baseline", () => {
  it("prefers top-level linked_grow_event_id over details.grow_event_id", () => {
    const link = pickLogicalGrowEventLink({
      id: "d1",
      linked_grow_event_id: "spine-modern",
      details: { grow_event_id: "spine-legacy" },
    });
    expect(link).toBe("spine-modern");
  });

  it("prefers details.linked_grow_event_id over details.grow_event_id when top-level is empty", () => {
    const link = pickLogicalGrowEventLink({
      id: "d1",
      details: {
        linked_grow_event_id: "spine-a",
        grow_event_id: "spine-b",
      },
    });
    expect(link).toBe("spine-a");
  });

  it("returns the modern link string even when it is not a UUID (no fallback here)", () => {
    const link = pickLogicalGrowEventLink({
      id: "d1",
      details: {
        linked_grow_event_id: "not-a-uuid",
        grow_event_id: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(link).toBe("not-a-uuid");
  });

  it("falls through to legacy grow_event_id only when no modern link is set", () => {
    const link = pickLogicalGrowEventLink({
      id: "d1",
      details: { grow_event_id: "spine-legacy-only" },
    });
    expect(link).toBe("spine-legacy-only");
  });
});

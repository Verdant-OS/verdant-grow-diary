/**
 * Global search diary spec — logical grow-event link baseline (requirement 1).
 *
 * Diary search dedupe uses `pickLogicalGrowEventLink` (`timelineMergeRules.ts`).
 * These cases mirror docs/specs/global-search-diary-entries.md acceptance traps:
 * modern link wins over legacy, invalid modern values are still picked (RPC must
 * not fall back to legacy), and row-level aliases precede details JSON.
 */
import { describe, expect, it } from "vitest";

import { pickLogicalGrowEventLink, type DiaryEntryRowInput } from "@/lib/timelineMergeRules";

const row = (over: Partial<DiaryEntryRowInput> = {}): DiaryEntryRowInput => ({
  id: "d1",
  ...over,
});

describe("global search diary link pick baseline", () => {
  it("prefers row linked_grow_event_id over row grow_event_id and details keys", () => {
    expect(
      pickLogicalGrowEventLink(
        row({
          linked_grow_event_id: "modern-row",
          grow_event_id: "legacy-row",
          details: { linked_grow_event_id: "modern-details", grow_event_id: "legacy-details" },
        }),
      ),
    ).toBe("modern-row");
  });

  it("uses details.linked_grow_event_id before details.grow_event_id when row aliases are empty", () => {
    expect(
      pickLogicalGrowEventLink(
        row({
          details: {
            linked_grow_event_id: "spine-a",
            grow_event_id: "spine-b",
          },
        }),
      ),
    ).toBe("spine-a");
  });

  it("returns a non-uuid modern link without falling back to a valid legacy id in details", () => {
    const spineB = "00000000-0000-4000-8000-000000000002";
    expect(
      pickLogicalGrowEventLink(
        row({
          details: {
            linked_grow_event_id: "not-a-uuid",
            grow_event_id: spineB,
          },
        }),
      ),
    ).toBe("not-a-uuid");
  });

  it("skips empty strings but does not trim whitespace-only row links", () => {
    expect(
      pickLogicalGrowEventLink(
        row({
          linked_grow_event_id: "",
          grow_event_id: "",
          details: { grow_event_id: "legacy-only" },
        }),
      ),
    ).toBe("legacy-only");
    expect(pickLogicalGrowEventLink(row({ linked_grow_event_id: "  " }))).toBe("  ");
  });

  it("returns null when no link field is populated", () => {
    expect(pickLogicalGrowEventLink(row({ details: {} }))).toBeNull();
  });
});

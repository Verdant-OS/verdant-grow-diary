/**
 * Global search diary spec — grow-event link resolution baseline (requirement 1).
 *
 * Diary/spine pairing must follow the same preferred-link rule as Timeline
 * (`pickLogicalGrowEventLink`). A present but unusable modern link must not
 * fall back to a legacy key — the implementing slice reuses or mirrors this.
 */
import { describe, expect, it } from "vitest";

import { pickLogicalGrowEventLink, type DiaryEntryRowInput } from "@/lib/timelineMergeRules";

const baseRow = (overrides: Partial<DiaryEntryRowInput> = {}): DiaryEntryRowInput => ({
  id: "diary-1",
  ...overrides,
});

describe("global search diary link resolution baseline", () => {
  it("does not fall back to details.grow_event_id when details.linked_grow_event_id is a non-empty string", () => {
    const link = pickLogicalGrowEventLink(
      baseRow({
        details: {
          linked_grow_event_id: "not-a-uuid",
          grow_event_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      }),
    );
    expect(link).toBe("not-a-uuid");
  });

  it("prefers row.linked_grow_event_id before details keys (Timeline helper order)", () => {
    const link = pickLogicalGrowEventLink(
      baseRow({
        linked_grow_event_id: "row-modern",
        details: {
          linked_grow_event_id: "details-modern",
          grow_event_id: "details-legacy",
        },
      }),
    );
    expect(link).toBe("row-modern");
  });

  it("uses details.linked_grow_event_id before details.grow_event_id when row-level links are empty", () => {
    const link = pickLogicalGrowEventLink(
      baseRow({
        details: {
          linked_grow_event_id: "details-modern",
          grow_event_id: "details-legacy",
        },
      }),
    );
    expect(link).toBe("details-modern");
  });

  it("returns null when every candidate is missing or an empty string", () => {
    expect(
      pickLogicalGrowEventLink(
        baseRow({
          details: { linked_grow_event_id: "", grow_event_id: "" },
        }),
      ),
    ).toBeNull();
  });

  it("treats whitespace-only link text as present (search must trim or validate separately)", () => {
    expect(
      pickLogicalGrowEventLink(
        baseRow({
          details: { grow_event_id: "   " },
        }),
      ),
    ).toBe("   ");
  });
});

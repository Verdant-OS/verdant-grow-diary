/**
 * A failed plant-list read must not look like a successful empty list.
 * Merge Duplicate stays available until a read succeeds with no selectable target.
 */
import { describe, expect, it } from "vitest";
import { isMergeDuplicateEntryEnabled } from "@/lib/plantMergeTargetReasonRules";

describe("Merge Duplicate entry after a failed plant-list read", () => {
  it("keeps Merge Duplicate available when the plant list read failed", () => {
    expect(
      isMergeDuplicateEntryEnabled({
        fetched: true,
        selectableOptionCount: 0,
        succeeded: false,
      }),
    ).toBe(true);
  });
});

/**
 * A failed plant-list read must not look like a successful empty list.
 * Merge Duplicate stays available until a read succeeds with no selectable target.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMergeDuplicateEntryEnabled } from "@/lib/plantMergeTargetReasonRules";

const DIALOG = readFileSync(resolve(process.cwd(), "src/components/PlantMergeDialog.tsx"), "utf8");

describe("Merge Duplicate entry after a failed plant-list read", () => {
  it("keeps Merge Duplicate available when the plant list read failed", () => {
    expect(
      isMergeDuplicateEntryEnabled({
        fetched: true,
        selectableOptionCount: 0,
        succeeded: false,
      }),
    ).toBe(true);
    expect(DIALOG).toMatch(/succeeded:\s*plantsSucceeded/);
    expect(DIALOG).not.toMatch(/fetched:\s*plantsFetched/);
  });
});

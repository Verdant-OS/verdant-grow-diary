/**
 * Regression: Merge Duplicate must stay closed when the only other plant
 * is visible but disabled (missing grow context). Visible options include
 * those plants; only selectable ones can be chosen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyMergeTargetOption,
  isMergeDuplicateEntryEnabled,
} from "@/lib/plantMergeTargetReasonRules";

const DIALOG = readFileSync(resolve(process.cwd(), "src/components/PlantMergeDialog.tsx"), "utf8");

const tents = [
  { id: "tent-a", grow_id: "grow-1" },
  { id: "tent-orphan", grow_id: null },
];

const source = {
  id: "src",
  name: "Source",
  grow_id: "grow-1",
  tent_id: "tent-a",
  is_archived: false,
};

describe("Merge Duplicate entry selectable count", () => {
  it("keeps Merge Duplicate closed when the only other plant is visible but not selectable", () => {
    const onlyOther = classifyMergeTargetOption(
      source,
      { id: "orphan", name: "Orphan", grow_id: null, tent_id: "tent-orphan" },
      tents,
    );
    expect(onlyOther.hidden).toBe(false);
    expect(onlyOther.selectable).toBe(false);
    const selectableOptionCount = [onlyOther].filter((c) => c.selectable).length;
    expect(selectableOptionCount).toBe(0);
    expect(isMergeDuplicateEntryEnabled({ fetched: true, selectableOptionCount })).toBe(false);
    expect(isMergeDuplicateEntryEnabled({ fetched: true, selectableOptionCount: 1 })).toBe(true);
    expect(DIALOG).toMatch(
      /selectableOptionCount:\s*classifications\.filter\(\(c\) => c\.selectable\)\.length/,
    );
    expect(DIALOG).not.toMatch(/visibleOptionCount/);
  });
});

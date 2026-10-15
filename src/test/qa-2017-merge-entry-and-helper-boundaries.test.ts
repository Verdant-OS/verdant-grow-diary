/**
 * QA #2017 — boundary coverage for merge-entry gating and the
 * add-existing "only plant in tent" helper. Keeps assertions in a
 * dedicated file so scorer-locked rule tests stay untouched.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getPlantDropdownHelperText } from "@/lib/plantDropdownReasonRules";
import { isMergeDuplicateEntryEnabled } from "@/lib/plantMergeTargetReasonRules";

const MERGE_DIALOG = readFileSync(
  resolve(process.cwd(), "src/components/PlantMergeDialog.tsx"),
  "utf8",
);

describe("isMergeDuplicateEntryEnabled boundaries", () => {
  it("treats a successful read without fetched as settled", () => {
    expect(
      isMergeDuplicateEntryEnabled({ fetched: false, selectableOptionCount: 0, succeeded: true }),
    ).toBe(false);
    expect(
      isMergeDuplicateEntryEnabled({ fetched: false, selectableOptionCount: 2, succeeded: true }),
    ).toBe(true);
  });

  it("wires PlantMergeDialog to selectable count and plantsSucceeded", () => {
    expect(MERGE_DIALOG).toMatch(/isSuccess:\s*plantsSucceeded/);
    expect(MERGE_DIALOG).toMatch(/succeeded:\s*plantsSucceeded/);
    expect(MERGE_DIALOG).toMatch(
      /selectableOptionCount:\s*classifications\.filter\(\(c\) => c\.selectable\)\.length/,
    );
  });
});

describe("getPlantDropdownHelperText only-plant-in-tent boundaries", () => {
  it("does not use the short line when another hidden bucket applies", () => {
    const text = getPlantDropdownHelperText({
      total: 2,
      visible: 0,
      hiddenArchived: 1,
      hiddenCrossGrow: 0,
      hiddenMissingGrow: 0,
      hiddenSourcePlant: 0,
      hiddenAlreadyInTent: 1,
    });
    expect(text).not.toBe("This tent's only plant is already here.");
    expect(text).toMatch(/Showing 0 active plants\./);
    expect(text).toMatch(/1 archived\/merged hidden\./);
  });
});

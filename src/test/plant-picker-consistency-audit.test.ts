/**
 * Plant picker consistency audit — static safety contract.
 *
 * Verifies that every UI surface where a grower picks a plant from a list
 * does not silently hide valid plants via hardcoded slicing or fixed-N
 * limits. Catches the entire bug class behind the recent
 * "dropdown only shows one plant" confusion.
 *
 * Also asserts the QuickLog plant picker now flows through the
 * `filterQuickLogPlantOptions` pure rule (so its scope is deterministic
 * and matches its helper text), and that the new Plants page filter
 * controls remain wired through `plantsPageFilterRules`.
 *
 * No runtime UI — read-only source scan.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PICKERS: Record<string, string> = {
  Plants: read("src/pages/Plants.tsx"),
  QuickLog: read("src/components/QuickLog.tsx"),
  AddExistingPlantDialog: read("src/components/AddExistingPlantDialog.tsx"),
  PlantMergeDialog: read("src/components/PlantMergeDialog.tsx"),
};

describe("Plant picker consistency — no hardcoded list limits", () => {
  it.each(Object.entries(PICKERS))(
    "%s does not slice or .limit() the plant list",
    (_name, src) => {
      // Catch obvious truncators that could hide plants from a grower.
      expect(src).not.toMatch(/plants\.slice\s*\(/);
      expect(src).not.toMatch(/scopedPlants\.slice\s*\(/);
      expect(src).not.toMatch(/filtered\.slice\s*\(/);
      // Server-side hard limits on the plant list are likewise a smell here.
      expect(src).not.toMatch(/\.from\(["']plants["']\)[\s\S]{0,400}?\.limit\s*\(/);
    },
  );

  it.each(Object.entries(PICKERS))(
    "%s has no privileged / device-control surface",
    (_name, src) => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|webhook/i,
      );
    },
  );
});

describe("QuickLog plant picker — scoped via pure rule", () => {
  it("imports and uses filterQuickLogPlantOptions", () => {
    expect(PICKERS.QuickLog).toMatch(/filterQuickLogPlantOptions/);
    expect(PICKERS.QuickLog).toMatch(/quickLogPlantHelperText/);
  });
  it("renders options from the scoped list, not the raw plants list", () => {
    expect(PICKERS.QuickLog).toMatch(/\{scopedPlants\.map/);
  });
  it("does not render the old misleading 'Showing plants from' literal", () => {
    expect(PICKERS.QuickLog).not.toMatch(/Showing plants from \$\{activeGrow\.name\}/);
  });
  it("renders a testable plant select trigger", () => {
    expect(PICKERS.QuickLog).toMatch(/data-testid="quick-log-plant-select"/);
  });
});

describe("Plants page — filter controls remain pure-rule wired", () => {
  it("Plants page uses the dedicated grow filter + plant search helpers", () => {
    expect(PICKERS.Plants).toMatch(/buildGrowFilterOptions/);
    expect(PICKERS.Plants).toMatch(/filterPlantsBySearch/);
    expect(PICKERS.Plants).toMatch(/summarizePlantsPageFilters/);
  });
});

describe("Merge target picker — same-grow intent is visible to the user", () => {
  it("uses the merge-target reason rules helper", () => {
    expect(PICKERS.PlantMergeDialog).toMatch(/plantMergeTargetReasonRules/);
  });
  it("explains why cross-grow targets are blocked in helper copy", () => {
    // Same-grow safety rule must be reflected in visible copy somewhere
    // in the dialog so growers understand why targets are filtered.
    expect(PICKERS.PlantMergeDialog).toMatch(/same.?grow/i);
  });
});

describe("Add Existing Plant picker — eligibility stays transparent", () => {
  it("uses the eligibility rules helper", () => {
    expect(PICKERS.AddExistingPlantDialog).toMatch(/plantDropdownEligibilityRules|plantDropdownReasonRules/);
  });
});

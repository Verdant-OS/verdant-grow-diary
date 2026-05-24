/**
 * Pure tests for QuickLog plant picker scoping rules.
 *
 * Behavior under audit:
 *   - When no active grow is selected → returns every active plant.
 *   - When an active grow is selected → returns plants matching that
 *     grow_id, plus legacy plants with null grow_id (so we never silently
 *     hide a plant that has no grow assignment from a scoped picker).
 *   - Archived/merged plants are always excluded.
 *   - Helper text always tells the truth about the current scope.
 */

import { describe, expect, it } from "vitest";
import {
  filterQuickLogPlantOptions,
  quickLogPlantHelperText,
} from "@/lib/quickLogPlantOptionRules";

const plants = [
  { id: "p1", name: "A", grow_id: "g1" },
  { id: "p2", name: "B", grow_id: "g1" },
  { id: "p3", name: "C", grow_id: "g2" },
  { id: "p4", name: "Legacy", grow_id: null, tent_id: "t1" },
  { id: "p5", name: "Archived", grow_id: "g1", is_archived: true },
  { id: "p6", name: "Merged", grow_id: "g1", merged_into_plant_id: "p1" },
];

describe("filterQuickLogPlantOptions", () => {
  it("returns every active plant when no grow is selected", () => {
    const r = filterQuickLogPlantOptions(plants, null);
    expect(r.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("scopes plants by grow_id when a grow is selected", () => {
    const r = filterQuickLogPlantOptions(plants, "g1");
    expect(r.map((p) => p.id).sort()).toEqual(["p1", "p2", "p4"]);
  });

  it("includes legacy null-grow_id plants in any scoped grow", () => {
    const r1 = filterQuickLogPlantOptions(plants, "g1");
    const r2 = filterQuickLogPlantOptions(plants, "g2");
    expect(r1.map((p) => p.id)).toContain("p4");
    expect(r2.map((p) => p.id)).toContain("p4");
  });

  it("never returns archived or merged plants", () => {
    const r = filterQuickLogPlantOptions(plants, "g1");
    expect(r.map((p) => p.id)).not.toContain("p5");
    expect(r.map((p) => p.id)).not.toContain("p6");
  });

  it("treats empty string activeGrowId as 'no grow selected'", () => {
    const r = filterQuickLogPlantOptions(plants, "");
    expect(r.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });
});

describe("quickLogPlantHelperText", () => {
  it("describes scoped-grow case with the grow's name", () => {
    expect(quickLogPlantHelperText("Sour Diesel Auto", true)).toBe(
      "Showing plants from Sour Diesel Auto. Archived/merged plants hidden.",
    );
  });
  it("falls back to 'this grow' when name is unknown but a grow is selected", () => {
    expect(quickLogPlantHelperText(null, true)).toBe(
      "Showing plants from this grow. Archived/merged plants hidden.",
    );
  });
  it("describes the cross-grow case when no grow is selected", () => {
    expect(quickLogPlantHelperText(null, false)).toBe(
      "Showing plants across all grows. Archived/merged plants hidden.",
    );
  });
});

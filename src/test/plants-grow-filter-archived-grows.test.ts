/**
 * QA 2026-09-24, BUG-014: "All grows (72 plants)" while the listed grows
 * summed to ~18. Active plants in archived grows (the grows list excludes
 * archived grows) counted toward the total but toward no option.
 */
import { describe, expect, it } from "vitest";
import { buildGrowFilterOptions } from "@/lib/plantsPageFilterRules";

const grows = [
  { id: "g1", name: "QA Save Retrieve" },
  { id: "g2", name: "E2E Bug Finder" },
];

describe("grow filter counts reconcile", () => {
  it("names plants that sit in grows not in the list", () => {
    const plants = [
      { id: "p1", name: "A", growId: "g1" },
      { id: "p2", name: "B", growId: "g2" },
      { id: "p3", name: "C", growId: null },
      { id: "p4", name: "D", growId: "archived-grow" },
      { id: "p5", name: "E", growId: "archived-grow" },
      { id: "p6", name: "F", growId: "g1", isArchived: true },
    ];
    const [all, ...rest] = buildGrowFilterOptions(grows, plants);
    expect(all.label).toBe("All grows (5 plants · 2 in archived grows)");
    const listed = rest.reduce((sum, o) => sum + o.plantCount, 0);
    expect(listed + 2).toBe(all.plantCount);
  });

  it("keeps the plain label when every plant is attributable", () => {
    const [all] = buildGrowFilterOptions(grows, [
      { id: "p1", name: "A", growId: "g1" },
      { id: "p3", name: "C", growId: null },
    ]);
    expect(all.label).toBe("All grows (2 plants)");
  });

  it("makes no archived claim until the grows list has loaded", () => {
    // Codex review on #1683: while useGrows() is loading or failed, `grows`
    // is empty and every assigned plant looked "in archived grows".
    const plants = [
      { id: "p1", name: "A", growId: "g1" },
      { id: "p2", name: "B", growId: "g2" },
    ];
    const [pending] = buildGrowFilterOptions([], plants, undefined, {
      growsListResolved: false,
    });
    expect(pending.label).toBe("All grows (2 plants)");
    const [resolved] = buildGrowFilterOptions([], plants, undefined, {
      growsListResolved: true,
    });
    expect(resolved.label).toBe("All grows (2 plants · 2 in archived grows)");
  });

  it("attributes through the tent before calling a grow unlisted", () => {
    const tentGrowById = new Map<string, string | null>([["t1", "g2"]]);
    const [all] = buildGrowFilterOptions(
      grows,
      [{ id: "p1", name: "A", growId: null, tentId: "t1" }],
      tentGrowById,
    );
    expect(all.label).toBe("All grows (1 plant)");
  });
});

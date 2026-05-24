/**
 * Pure-rule tests for Plants page filter helpers.
 *
 * Covers: grow filter option building (with counts + "All grows" leader),
 * grow filter, plant search across name/strain/tent label, filter summary
 * formatting, and empty-state copy.
 *
 * No I/O. No mocks. Deterministic.
 */

import { describe, expect, it } from "vitest";
import {
  buildGrowFilterOptions,
  filterPlantsByGrow,
  filterPlantsBySearch,
  summarizePlantsPageFilters,
  formatPlantsPageFilterSummary,
  plantsPageEmptyStateCopy,
} from "@/lib/plantsPageFilterRules";

const grows = [
  { id: "g1", name: "Sour Diesel Auto" },
  { id: "g2", name: "Blue Dream" },
];

const tents = [
  { id: "t1", name: "Flowering" },
  { id: "t2", name: "Veg" },
];

const plants = [
  { id: "p1", name: "SD-1", strain: "Sour Diesel", growId: "g1", tentId: "t1" },
  { id: "p2", name: "SD-2", strain: "Sour Diesel", growId: "g1", tentId: "t1" },
  { id: "p3", name: "SD-3", strain: "Sour Diesel", growId: "g1", tentId: "t2" },
  { id: "p4", name: "BD-1", strain: "Blue Dream", growId: "g2", tentId: "t2" },
  // Archived/merged should never count toward grow option counts.
  { id: "p5", name: "old", strain: "x", growId: "g1", isArchived: true },
  { id: "p6", name: "merged", strain: "x", growId: "g2", mergedIntoPlantId: "p4" },
];

describe("buildGrowFilterOptions", () => {
  it("always includes an 'All grows' option first with the total active count", () => {
    const opts = buildGrowFilterOptions(grows, plants);
    expect(opts[0]).toMatchObject({
      id: "",
      name: "All grows",
      plantCount: 4,
      label: "All grows (4 plants)",
    });
  });

  it("includes per-grow plant counts with correct pluralization", () => {
    const opts = buildGrowFilterOptions(grows, plants);
    expect(opts[1].label).toBe("Sour Diesel Auto (3 plants)");
    expect(opts[1].plantCount).toBe(3);
    expect(opts[2].label).toBe("Blue Dream (1 plant)");
    expect(opts[2].plantCount).toBe(1);
  });

  it("does not count archived or merged plants", () => {
    const opts = buildGrowFilterOptions(grows, plants);
    expect(opts[0].plantCount).toBe(4);
  });

  it("renders zero-count grows cleanly", () => {
    const opts = buildGrowFilterOptions(
      [{ id: "g9", name: "Empty Grow" }],
      [],
    );
    expect(opts[1].label).toBe("Empty Grow (0 plants)");
  });
});

describe("filterPlantsByGrow", () => {
  it("returns all plants when selectedGrowId is null/empty", () => {
    expect(filterPlantsByGrow(plants, null).length).toBe(plants.length);
    expect(filterPlantsByGrow(plants, "").length).toBe(plants.length);
  });
  it("returns only plants matching the selected grow", () => {
    const r = filterPlantsByGrow(plants, "g1");
    expect(r.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p5"]);
  });
});

describe("filterPlantsBySearch", () => {
  it("returns input untouched for empty/whitespace queries", () => {
    expect(filterPlantsBySearch(plants, "", tents).length).toBe(plants.length);
    expect(filterPlantsBySearch(plants, "   ", tents).length).toBe(plants.length);
  });
  it("matches by plant name (case insensitive)", () => {
    const r = filterPlantsBySearch(plants, "sd-1", tents);
    expect(r.map((p) => p.id)).toEqual(["p1"]);
  });
  it("matches by strain", () => {
    const r = filterPlantsBySearch(plants, "blue dream", tents);
    expect(r.map((p) => p.id)).toEqual(["p4"]);
  });
  it("matches by tent label", () => {
    const r = filterPlantsBySearch(plants, "flower", tents);
    expect(r.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });
  it("combines with grow filter correctly", () => {
    const scoped = filterPlantsByGrow(plants, "g1");
    const r = filterPlantsBySearch(scoped, "veg", tents);
    expect(r.map((p) => p.id)).toEqual(["p3"]);
  });
  it("tolerates missing fields", () => {
    const r = filterPlantsBySearch(
      [{ id: "x", growId: "g1" }, ...plants],
      "sd",
      tents,
    );
    expect(r.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("summarizePlantsPageFilters / formatPlantsPageFilterSummary", () => {
  it("summarizes 'across all grows' when no grow is selected", () => {
    const s = summarizePlantsPageFilters(plants, {
      selectedGrowId: null,
      selectedGrowName: null,
      search: "",
    });
    expect(s.activeCount).toBe(4);
    expect(s.archivedHiddenCount).toBe(2);
    expect(formatPlantsPageFilterSummary(s)).toBe(
      "Showing 4 plants across all grows",
    );
  });
  it("summarizes 'in {Grow Name}' when a grow is selected", () => {
    const scoped = filterPlantsByGrow(plants, "g1");
    const s = summarizePlantsPageFilters(scoped, {
      selectedGrowId: "g1",
      selectedGrowName: "Sour Diesel Auto",
      search: "",
    });
    expect(s.activeCount).toBe(3);
    expect(formatPlantsPageFilterSummary(s)).toBe(
      "Showing 3 plants in Sour Diesel Auto",
    );
  });
  it("falls back to 'in this grow' when name is unknown", () => {
    const s = summarizePlantsPageFilters([], {
      selectedGrowId: "ghost",
      selectedGrowName: null,
      search: "",
    });
    expect(formatPlantsPageFilterSummary(s)).toBe(
      "Showing 0 plants in this grow",
    );
  });
  it("pluralizes correctly for 1 plant", () => {
    const s = summarizePlantsPageFilters([plants[0]], {
      selectedGrowId: null,
      selectedGrowName: null,
      search: "",
    });
    expect(formatPlantsPageFilterSummary(s)).toBe(
      "Showing 1 plant across all grows",
    );
  });
});

describe("plantsPageEmptyStateCopy", () => {
  it("returns null when there are visible plants", () => {
    expect(
      plantsPageEmptyStateCopy(3, {
        selectedGrowId: null,
        selectedGrowName: null,
        search: "",
      }),
    ).toBeNull();
  });
  it("returns search-specific copy when search is active", () => {
    expect(
      plantsPageEmptyStateCopy(0, {
        selectedGrowId: null,
        selectedGrowName: null,
        search: "xyz",
      }),
    ).toBe("No plants match this search.");
  });
  it("returns grow-specific copy when a grow is selected and empty", () => {
    expect(
      plantsPageEmptyStateCopy(0, {
        selectedGrowId: "g1",
        selectedGrowName: "Sour Diesel Auto",
        search: "",
      }),
    ).toBe("No plants in this grow yet.");
  });
  it("returns the global empty copy when nothing exists at all", () => {
    expect(
      plantsPageEmptyStateCopy(0, {
        selectedGrowId: null,
        selectedGrowName: null,
        search: "",
      }),
    ).toBe("No plants yet.");
  });
});

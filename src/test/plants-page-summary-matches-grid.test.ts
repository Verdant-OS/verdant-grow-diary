/**
 * Friction item 2: /plants said "3 plants" over 2 cards. The summary now
 * counts the same list as the grid, where a plant in an archived grow is
 * archived.
 */
import { describe, expect, it } from "vitest";
import { summarizePlantsPageFilters } from "@/lib/plantsPageFilterRules";
import { isActivePlant, withGrowArchiveVisibility } from "@/lib/archivedPlantVisibilityRules";

const PLANTS = [
  { id: "p1", name: "A", growId: "g-live", tentId: "t1", isArchived: false },
  { id: "p2", name: "B", growId: "g-live", tentId: "t1", isArchived: false },
  { id: "p3", name: "C", growId: "g-old", tentId: "t9", isArchived: false },
  { id: "p4", name: "D", growId: "g-live", tentId: "t1", isArchived: true },
];

describe("plants page summary counts the grid's list", () => {
  it("a plant in an archived grow is counted archived, matching the cards", () => {
    const list = withGrowArchiveVisibility(PLANTS, new Set(["g-old"]));
    const cards = list.filter((p) => isActivePlant(p)).length;
    const summary = summarizePlantsPageFilters(list, { selectedGrowId: null, search: "" });
    expect(cards).toBe(2);
    expect(summary.activeCount).toBe(cards);
    expect(summary.archivedHiddenCount).toBe(list.filter((p) => !isActivePlant(p)).length);
    expect(summary.archivedHiddenCount).toBe(2);
  });

  it("without archived grows nothing changes", () => {
    const summary = summarizePlantsPageFilters(PLANTS, { selectedGrowId: null, search: "" });
    expect(summary.archivedHiddenCount).toBe(1);
  });
});

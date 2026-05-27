/**
 * AUD-005 — Plants page tent filter chip counts must match the rendered
 * grid under the same filters (archived toggle + search). These tests
 * lock in the pure helper that powers the chip row.
 */
import { describe, it, expect } from "vitest";
import { buildPlantsTentFilterChips } from "@/lib/plantsTentFilterChipsRules";
import { filterVisiblePlants } from "@/lib/archivedPlantVisibilityRules";
import { filterPlantsBySearch } from "@/lib/plantsPageFilterRules";

const tents = [
  { id: "tent-a", name: "Tent A" },
  { id: "tent-b", name: "Tent B" },
];

const plants = [
  { id: "p1", name: "Blue Dream", strain: "Blue Dream", tentId: "tent-a" },
  { id: "p2", name: "Sour Diesel", strain: "Sour Diesel", tentId: "tent-a" },
  { id: "p3", name: "Northern Lights", strain: "Northern Lights", tentId: "tent-b" },
  // Archived
  { id: "p4", name: "Old Plant", strain: "OG Kush", tentId: "tent-a", isArchived: true },
  // Merged (archived + merge marker)
  {
    id: "p5",
    name: "Merged",
    strain: "Wedding Cake",
    tentId: "tent-b",
    isArchived: true,
    lastNote: "Merged into 11111111-1111-1111-1111-111111111111",
  },
];

describe("AUD-005 buildPlantsTentFilterChips", () => {
  it("excludes archived and merged plants by default", () => {
    const chips = buildPlantsTentFilterChips(plants, tents, {
      showArchived: false,
      search: "",
    });
    expect(chips.find((c) => c.id === "all")?.count).toBe(3);
    expect(chips.find((c) => c.id === "tent-a")?.count).toBe(2);
    expect(chips.find((c) => c.id === "tent-b")?.count).toBe(1);
  });

  it("includes archived and merged plants when showArchived is true", () => {
    const chips = buildPlantsTentFilterChips(plants, tents, {
      showArchived: true,
      search: "",
    });
    expect(chips.find((c) => c.id === "all")?.count).toBe(5);
    expect(chips.find((c) => c.id === "tent-a")?.count).toBe(3);
    expect(chips.find((c) => c.id === "tent-b")?.count).toBe(2);
  });

  it("applies the search filter so chip totals match the rendered grid", () => {
    const chips = buildPlantsTentFilterChips(plants, tents, {
      showArchived: false,
      search: "blue",
    });
    expect(chips.find((c) => c.id === "all")?.count).toBe(1);
    expect(chips.find((c) => c.id === "tent-a")?.count).toBe(1);
    expect(chips.find((c) => c.id === "tent-b")?.count).toBe(0);
  });

  it("chip counts always equal the post-archive + post-search pipeline", () => {
    const cases = [
      { showArchived: false, search: "" },
      { showArchived: true, search: "" },
      { showArchived: false, search: "diesel" },
      { showArchived: true, search: "merged" },
      { showArchived: false, search: "tent a" },
    ];
    for (const opts of cases) {
      const chips = buildPlantsTentFilterChips(plants, tents, opts);
      const visible = filterPlantsBySearch(
        filterVisiblePlants(plants, { showArchived: opts.showArchived }),
        opts.search,
        tents,
      );
      expect(chips.find((c) => c.id === "all")?.count).toBe(visible.length);
      for (const t of tents) {
        const tentVisible = visible.filter((p) => p.tentId === t.id).length;
        expect(chips.find((c) => c.id === t.id)?.count).toBe(tentVisible);
      }
    }
  });

  it("always renders an 'All tents' chip first followed by one chip per tent", () => {
    const chips = buildPlantsTentFilterChips(plants, tents, {
      showArchived: false,
      search: "",
    });
    expect(chips[0].id).toBe("all");
    expect(chips.slice(1).map((c) => c.id)).toEqual(["tent-a", "tent-b"]);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildPlantsTentFilterChips(plants, tents, {
      showArchived: false,
      search: "diesel",
    });
    const b = buildPlantsTentFilterChips(plants, tents, {
      showArchived: false,
      search: "diesel",
    });
    expect(a).toEqual(b);
  });
});

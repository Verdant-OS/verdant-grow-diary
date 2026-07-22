/**
 * AUD-005 — Plants page tent filter chip counts must match the rendered
 * grid under the same filters (archived toggle + search). These tests
 * lock in the pure helper that powers the chip row.
 */
import { describe, it, expect } from "vitest";
import {
  buildPlantsTentFilterChips,
  filterPlantsByTentChip,
  NO_TENT_FILTER_CHIP_ID,
} from "@/lib/plantsTentFilterChipsRules";
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

  it("renders no 'No tent' chip when every plant has a tent", () => {
    const chips = buildPlantsTentFilterChips(plants, tents, {
      showArchived: true,
      search: "",
    });
    expect(chips.some((c) => c.id === NO_TENT_FILTER_CHIP_ID)).toBe(false);
  });
});

describe("AUD-005 'No tent' bucket", () => {
  // plants.tent_id is nullable; the adapter maps a null tent_id to "".
  const plantsWithNoTent = [
    { id: "p1", name: "Blue Dream", strain: "Blue Dream", tentId: "tent-a" },
    { id: "p2", name: "Loose One", strain: "Gelato", tentId: null },
    { id: "p3", name: "Loose Two", strain: "Gelato", tentId: "" },
    // Archived and tent-less at once.
    { id: "p4", name: "Old Loose", strain: "OG Kush", tentId: null, isArchived: true },
  ];

  it("appends a 'No tent (n)' chip when visible plants have no tent", () => {
    const chips = buildPlantsTentFilterChips(plantsWithNoTent, tents, {
      showArchived: false,
      search: "",
    });
    expect(chips[chips.length - 1]).toMatchObject({
      id: NO_TENT_FILTER_CHIP_ID,
      name: "No tent",
      count: 2,
    });
  });

  it("chip counts including 'No tent' sum to the 'All tents' total", () => {
    for (const showArchived of [false, true]) {
      const chips = buildPlantsTentFilterChips(plantsWithNoTent, tents, {
        showArchived,
        search: "",
      });
      const all = chips.find((c) => c.id === "all");
      const sum = chips
        .filter((c) => c.id !== "all")
        .reduce((acc, c) => acc + c.count, 0);
      expect(sum).toBe(all?.count);
    }
  });

  it("keeps the chip (count 0) while search hides the tent-less plants", () => {
    const chips = buildPlantsTentFilterChips(plantsWithNoTent, tents, {
      showArchived: false,
      search: "blue",
    });
    expect(chips.find((c) => c.id === NO_TENT_FILTER_CHIP_ID)?.count).toBe(0);
  });

  it("filterPlantsByTentChip mirrors the chip buckets exactly", () => {
    const visible = filterVisiblePlants(plantsWithNoTent, { showArchived: false });
    expect(
      filterPlantsByTentChip(visible, NO_TENT_FILTER_CHIP_ID).map((p) => p.id),
    ).toEqual(["p2", "p3"]);
    expect(filterPlantsByTentChip(visible, "tent-a").map((p) => p.id)).toEqual(["p1"]);
    expect(filterPlantsByTentChip(visible, "all").length).toBe(visible.length);
  });

  it("chip counts equal filterPlantsByTentChip over the same pipeline", () => {
    const opts = { showArchived: true, search: "loose" };
    const chips = buildPlantsTentFilterChips(plantsWithNoTent, tents, opts);
    const visible = filterPlantsBySearch(
      filterVisiblePlants(plantsWithNoTent, { showArchived: opts.showArchived }),
      opts.search,
      tents,
    );
    for (const chip of chips.filter((c) => c.id !== "all")) {
      expect(filterPlantsByTentChip(visible, chip.id).length).toBe(chip.count);
    }
  });
});

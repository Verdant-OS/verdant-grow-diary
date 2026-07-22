/**
 * BUG-A — grow attribution for plants (2026-07-22).
 *
 * plants.grow_id and tents.grow_id are both legitimately nullable. A plant
 * whose own grow_id is null but whose tent belongs to a grow ("orphaned
 * tent" rollup) must resolve to that grow everywhere, and a plant that
 * resolves to no grow at all must stay VISIBLE as "Unassigned" — never
 * silently hidden while still counting in globals.
 *
 * Covers the pure helper (growAttributionRules) and its integration into
 * the Plants page filter rules (plantsPageFilterRules).
 *
 * No I/O. No mocks. Deterministic.
 */
import { describe, expect, it } from "vitest";
import {
  buildGrowScopedPlantsOrFilter,
  buildTentGrowIndex,
  filterPlantsByResolvedGrow,
  isGrowUnassigned,
  resolvePlantGrowId,
} from "@/lib/growAttributionRules";
import {
  buildGrowFilterOptions,
  filterPlantsByGrow,
  UNASSIGNED_GROW_FILTER_ID,
} from "@/lib/plantsPageFilterRules";

const tentIndex = buildTentGrowIndex([
  { id: "tent-in-grow", growId: "grow-a" },
  { id: "tent-orphaned", growId: null }, // tent exists, grow deleted/SET NULL
  { id: "tent-other-grow", growId: "grow-b" },
]);

describe("buildTentGrowIndex", () => {
  it("maps tent id → tent grow id, preserving null", () => {
    expect(tentIndex.get("tent-in-grow")).toBe("grow-a");
    expect(tentIndex.get("tent-orphaned")).toBeNull();
    expect(tentIndex.get("unknown-tent")).toBeUndefined();
  });

  it("tolerates null/undefined input and malformed tents", () => {
    expect(buildTentGrowIndex(null).size).toBe(0);
    expect(buildTentGrowIndex(undefined).size).toBe(0);
    expect(buildTentGrowIndex([{ id: "", growId: "g" }]).size).toBe(0);
  });
});

describe("resolvePlantGrowId", () => {
  it("resolves through tent.grow_id when the plant's own grow_id is null", () => {
    expect(
      resolvePlantGrowId({ growId: null, tentId: "tent-in-grow" }, tentIndex),
    ).toBe("grow-a");
  });

  it("returns null for a plant under an orphaned tent (tent grow null)", () => {
    expect(
      resolvePlantGrowId({ growId: null, tentId: "tent-orphaned" }, tentIndex),
    ).toBeNull();
  });

  it("plant.grow_id precedence wins over a different tent grow", () => {
    expect(
      resolvePlantGrowId({ growId: "grow-a", tentId: "tent-other-grow" }, tentIndex),
    ).toBe("grow-a");
  });

  it("returns null for no grow, no tent — genuinely unassigned", () => {
    expect(resolvePlantGrowId({ growId: null, tentId: null }, tentIndex)).toBeNull();
  });

  it("without an index, only the plant's own grow_id resolves (legacy behavior)", () => {
    expect(resolvePlantGrowId({ growId: "grow-a", tentId: "tent-in-grow" })).toBe("grow-a");
    expect(resolvePlantGrowId({ growId: null, tentId: "tent-in-grow" })).toBeNull();
  });

  it("never throws on nullish plants or unknown tents", () => {
    expect(resolvePlantGrowId(null, tentIndex)).toBeNull();
    expect(resolvePlantGrowId(undefined, tentIndex)).toBeNull();
    expect(resolvePlantGrowId({ growId: null, tentId: "unknown-tent" }, tentIndex)).toBeNull();
  });
});

describe("isGrowUnassigned", () => {
  it("rollup plants are NOT unassigned", () => {
    expect(isGrowUnassigned({ growId: null, tentId: "tent-in-grow" }, tentIndex)).toBe(false);
  });

  it("plants under an orphaned tent ARE unassigned (visible bucket, not hidden)", () => {
    expect(isGrowUnassigned({ growId: null, tentId: "tent-orphaned" }, tentIndex)).toBe(true);
  });

  it("plants with no grow and no tent are unassigned", () => {
    expect(isGrowUnassigned({ growId: null, tentId: null }, tentIndex)).toBe(true);
  });
});

describe("filterPlantsByResolvedGrow", () => {
  it("includes both directly-attributed and tent-rollup plants", () => {
    const plants = [
      { id: "direct", growId: "grow-a", tentId: null },
      { id: "rollup", growId: null, tentId: "tent-in-grow" },
      { id: "other", growId: "grow-b", tentId: null },
      { id: "orphan", growId: null, tentId: "tent-orphaned" },
    ];
    expect(
      filterPlantsByResolvedGrow(plants, "grow-a", tentIndex).map((p) => p.id),
    ).toEqual(["direct", "rollup"]);
  });
});

describe("buildGrowScopedPlantsOrFilter", () => {
  it("with tent ids: matches own grow_id OR membership in the grow's tents", () => {
    expect(buildGrowScopedPlantsOrFilter("grow-a", ["t1", "t2"])).toBe(
      "grow_id.eq.grow-a,tent_id.in.(t1,t2)",
    );
  });

  it("without tent ids: degrades to the legacy own-grow_id filter", () => {
    expect(buildGrowScopedPlantsOrFilter("grow-a", [])).toBe("grow_id.eq.grow-a");
    expect(buildGrowScopedPlantsOrFilter("grow-a", null)).toBe("grow_id.eq.grow-a");
    expect(buildGrowScopedPlantsOrFilter("grow-a", undefined)).toBe("grow_id.eq.grow-a");
  });

  it("drops blank tent ids rather than emitting an empty in-list entry", () => {
    expect(buildGrowScopedPlantsOrFilter("grow-a", ["", "t1"])).toBe(
      "grow_id.eq.grow-a,tent_id.in.(t1)",
    );
  });
});

describe("count consistency — every active plant lands in exactly one bucket", () => {
  const grows = [
    { id: "grow-a", name: "Grow A" },
    { id: "grow-b", name: "Grow B" },
  ];
  const activePlants = [
    { id: "p1", growId: "grow-a", tentId: "tent-in-grow" },
    { id: "p2", growId: null, tentId: "tent-in-grow" }, // rollup → grow-a
    { id: "p3", growId: "grow-b", tentId: null },
    { id: "p4", growId: null, tentId: "tent-orphaned" }, // orphaned tent → Unassigned
    { id: "p5", growId: null, tentId: null }, // genuinely unassigned
    // Archived plants never count toward option counts.
    { id: "p6", growId: null, tentId: "tent-in-grow", isArchived: true },
  ];

  it("active plants === sum of per-grow buckets + Unassigned, rollups under their grow", () => {
    const opts = buildGrowFilterOptions(grows, activePlants, tentIndex);
    const all = opts.find((o) => o.id === "");
    const perGrowAndUnassigned = opts.filter((o) => o.id !== "");
    expect(all?.plantCount).toBe(5);
    expect(
      perGrowAndUnassigned.reduce((acc, o) => acc + o.plantCount, 0),
    ).toBe(all?.plantCount);
    expect(opts.find((o) => o.id === "grow-a")?.plantCount).toBe(2);
    expect(opts.find((o) => o.id === "grow-b")?.plantCount).toBe(1);
    expect(opts.find((o) => o.id === UNASSIGNED_GROW_FILTER_ID)?.plantCount).toBe(2);
  });

  it("filterPlantsByGrow buckets partition the same plants the counts describe", () => {
    const bucketIds = [
      ...grows.map((g) => g.id),
      UNASSIGNED_GROW_FILTER_ID,
    ];
    const seen = new Map<string, number>();
    for (const bucket of bucketIds) {
      for (const p of filterPlantsByGrow(activePlants, bucket, tentIndex)) {
        seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
      }
    }
    // Every plant (active or archived — the filter itself does not drop
    // archived rows) appears in exactly one bucket.
    expect(seen.size).toBe(activePlants.length);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });
});

describe("Banana Cough regression — grow with only tent-rollup plants", () => {
  // A grow whose 9 plants all live in its tent with plant.grow_id null.
  // Before BUG-A the grow filter showed "0 plants" and the plants sat in
  // "Unassigned" while global counts said 9.
  const grows = [{ id: "banana-cough", name: "Banana Cough" }];
  const index = buildTentGrowIndex([{ id: "bc-tent", growId: "banana-cough" }]);
  const ninePlants = Array.from({ length: 9 }, (_, i) => ({
    id: `bc-${i + 1}`,
    name: `BC #${i + 1}`,
    growId: null,
    tentId: "bc-tent",
  }));

  it("buildGrowFilterOptions shows 9 under the grow and no Unassigned option", () => {
    const opts = buildGrowFilterOptions(grows, ninePlants, index);
    expect(opts.find((o) => o.id === "banana-cough")?.plantCount).toBe(9);
    expect(opts.find((o) => o.id === "banana-cough")?.label).toBe(
      "Banana Cough (9 plants)",
    );
    expect(opts.some((o) => o.id === UNASSIGNED_GROW_FILTER_ID)).toBe(false);
  });

  it("filterPlantsByGrow returns all 9 for the grow and none for Unassigned", () => {
    expect(filterPlantsByGrow(ninePlants, "banana-cough", index)).toHaveLength(9);
    expect(filterPlantsByGrow(ninePlants, UNASSIGNED_GROW_FILTER_ID, index)).toHaveLength(0);
  });

  it("without the index the legacy behavior still holds (fallback contract)", () => {
    const opts = buildGrowFilterOptions(grows, ninePlants);
    expect(opts.find((o) => o.id === "banana-cough")?.plantCount).toBe(0);
    expect(opts.find((o) => o.id === UNASSIGNED_GROW_FILTER_ID)?.plantCount).toBe(9);
    expect(filterPlantsByGrow(ninePlants, UNASSIGNED_GROW_FILTER_ID)).toHaveLength(9);
  });
});

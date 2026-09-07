import { describe, it, expect } from "vitest";
import {
  buildQuickLogV2TargetOptions,
  filterQuickLogV2TargetOptions,
  formatQuickLogV2TargetOptionLabel,
  isStaleQuickLogV2TargetSelection,
  partitionQuickLogV2TargetOptionsForTent,
  resolveQuickLogV2Target,
  resolveQuickLogV2TentContextId,
  resolveTentScopedQuickLogPlantSelection,
  shouldShowVolumeField,
  isPhotoSavingSupported,
  QUICK_LOG_V2_TARGET_FILTER_THRESHOLD,
  type QuickLogV2TargetOption,
} from "@/lib/quickLogV2Rules";

const tents = [
  { id: "t1", name: "Tent A", grow_id: "g1" },
  { id: "t2", name: "Tent B", grow_id: "g1" },
  { id: "t3", name: "Tent gone", grow_id: "g1", is_archived: true },
];
const plants = [
  { id: "p1", name: "Plant 1", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "Plant 2", tent_id: "t2", grow_id: "g1" },
  { id: "p3", name: "Archived", tent_id: "t2", grow_id: "g1", is_archived: true },
];

describe("quickLogV2Rules", () => {
  it("builds target options, skipping archived", () => {
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);
    expect(opts.find((o) => o.id === "t3")).toBeUndefined();
    expect(opts.find((o) => o.id === "p3")).toBeUndefined();
    expect(opts.length).toBe(4);
  });

  it("resolves selected plant target to that plant id (not first)", () => {
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);
    const r = resolveQuickLogV2Target(opts, "plant:p2");
    expect(r.ok).toBe(true);
    expect(r.targetType).toBe("plant");
    expect(r.targetId).toBe("p2");
    expect(r.plantId).toBe("p2");
    expect(r.tentId).toBe("t2");
  });

  it("resolves selected tent target with plantId null", () => {
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);
    const r = resolveQuickLogV2Target(opts, "tent:t2");
    expect(r.ok).toBe(true);
    expect(r.targetType).toBe("tent");
    expect(r.targetId).toBe("t2");
    expect(r.tentId).toBe("t2");
    expect(r.plantId).toBeNull();
  });

  it("rejects when nothing selected (no first-loaded fallback)", () => {
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);
    const r = resolveQuickLogV2Target(opts, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_selection");
  });

  it("rejects unknown selection key", () => {
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);
    const r = resolveQuickLogV2Target(opts, "plant:nope");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("selection_not_found");
  });

  it("distinguishes a stale target from an incomplete target draft", () => {
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);

    expect(isStaleQuickLogV2TargetSelection(resolveQuickLogV2Target(opts, null))).toBe(false);
    expect(isStaleQuickLogV2TargetSelection(resolveQuickLogV2Target(opts, "plant:nope"))).toBe(
      true,
    );
    expect(isStaleQuickLogV2TargetSelection(resolveQuickLogV2Target(opts, "plant:p2"))).toBe(false);
  });

  it("only shows volume field for water", () => {
    expect(shouldShowVolumeField("water")).toBe(true);
    expect(shouldShowVolumeField("note")).toBe(false);
    expect(shouldShowVolumeField("note")).toBe(false);
  });

  it("photo saving is supported in Gate 1 (deterministic, no env drift)", () => {
    // Photo saving is intentionally enabled: createQuickLogEvent accepts a
    // photoUrl and the photo gate state exposes active picker labels. The
    // helper must be deterministic and never read from environment headers.
    expect(isPhotoSavingSupported()).toBe(true);
    expect(isPhotoSavingSupported()).toBe(isPhotoSavingSupported());
  });
});

describe("quickLogV2Rules — archived/merged plant target hardening", () => {
  // Quick Log v1 hides plants that are archived OR soft-archived OR merged
  // (the canonical predicate in quickLogPlantOptionRules). The v2 target
  // builder now applies the same rule as defense-in-depth, NOT as closure
  // of a live hole: in the deployed schema the merge RPC always sets
  // is_archived=true on the merged source (see the merge_duplicate_plant
  // migration) and usePlants() filters archived rows server-side, so no
  // real row can reach this builder with archived_at or
  // merged_into_plant_id set today. Those columns are documented,
  // not-yet-applied schema in docs/plant-merge-execution-plan.md; these
  // tests pin the predicate so the v2 surface is already correct the day
  // that migration ships, and so any client path that loads plants
  // without the server-side filter still fails closed.
  const hardeningTents = [{ id: "t1", name: "Tent A", grow_id: "g1" }];
  const hardeningPlants = [
    { id: "p1", name: "Active", tent_id: "t1", grow_id: "g1" },
    {
      id: "p2",
      name: "Soft archived",
      tent_id: "t1",
      grow_id: "g1",
      archived_at: "2026-07-01T00:00:00Z",
    },
    {
      id: "p3",
      name: "Merged away",
      tent_id: "t1",
      grow_id: "g1",
      is_archived: false,
      merged_into_plant_id: "p1",
    },
  ];

  it("excludes plants soft-archived via archived_at even when is_archived is unset", () => {
    const opts = buildQuickLogV2TargetOptions(hardeningTents as any, hardeningPlants as any);
    expect(opts.find((o) => o.id === "p2")).toBeUndefined();
  });

  it("excludes merged plants (merged_into_plant_id set, is_archived false)", () => {
    const opts = buildQuickLogV2TargetOptions(hardeningTents as any, hardeningPlants as any);
    expect(opts.find((o) => o.id === "p3")).toBeUndefined();
  });

  it("still offers the active plant and its tent", () => {
    const opts = buildQuickLogV2TargetOptions(hardeningTents as any, hardeningPlants as any);
    expect(opts.map((o) => `${o.type}:${o.id}`).sort()).toEqual(["plant:p1", "tent:t1"]);
  });

  it("resolver cannot resolve a merged plant selection (no stale-key escape)", () => {
    // Even if a stale UI selection key for a merged plant survives in form
    // state, resolution must fail closed rather than write against it.
    const opts = buildQuickLogV2TargetOptions(hardeningTents as any, hardeningPlants as any);
    const r = resolveQuickLogV2Target(opts, "plant:p3");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("selection_not_found");
  });
});

describe("quickLogV2Rules — exclude unlinked grow targets", () => {
  it("omits tents and plants with null/blank grow_id from selectable options", () => {
    const tents = [
      { id: "flower-tent", name: "Flower Tent", grow_id: "mcdonalds" },
      { id: "orphan-flower", name: "Flower", grow_id: null },
      { id: "blank-grow", name: "Blank Grow Tent", grow_id: "   " },
    ];
    const plants = [
      { id: "m1", name: "McDonalds", tent_id: "flower-tent", grow_id: "mcdonalds" },
      { id: "loose", name: "Loose Plant", tent_id: "orphan-flower", grow_id: null },
    ];
    const opts = buildQuickLogV2TargetOptions(tents as any, plants as any);
    expect(opts.map((o) => `${o.type}:${o.id}`).sort()).toEqual([
      "plant:m1",
      "tent:flower-tent",
    ]);
    expect(opts.find((o) => o.id === "orphan-flower")).toBeUndefined();
    expect(opts.find((o) => o.id === "blank-grow")).toBeUndefined();
    expect(opts.find((o) => o.id === "loose")).toBeUndefined();
  });

  it("cannot resolve a stale selection key for an unlinked tent", () => {
    const tents = [
      { id: "flower-tent", name: "Flower Tent", grow_id: "mcdonalds" },
      { id: "orphan-flower", name: "Flower", grow_id: null },
    ];
    const opts = buildQuickLogV2TargetOptions(tents as any, [] as any);
    const r = resolveQuickLogV2Target(opts, "tent:orphan-flower");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("selection_not_found");
  });
});

describe("quickLogV2Rules — tent-scoped Target picker helpers", () => {
  const scopedTents = [
    { id: "veg-b", name: "Veg B", grow_id: "g1" },
    { id: "clones", name: "Clones", grow_id: "g1" },
  ];
  const scopedPlants = [
    { id: "sg1", name: "SG 1", tent_id: "veg-b", grow_id: "g1" },
    { id: "sg2", name: "SG 2", tent_id: "veg-b", grow_id: "g1" },
    { id: "c1", name: "Clone A", tent_id: "clones", grow_id: "g1" },
    { id: "orphan", name: "Loose", tent_id: null, grow_id: "g1" },
  ];

  const options = buildQuickLogV2TargetOptions(scopedTents as any, scopedPlants as any);

  it("resolves tent context from tent: keys only", () => {
    expect(resolveQuickLogV2TentContextId("tent:veg-b")).toBe("veg-b");
    expect(resolveQuickLogV2TentContextId("plant:sg1")).toBeNull();
    expect(resolveQuickLogV2TentContextId(null)).toBeNull();
    expect(resolveQuickLogV2TentContextId("  tent:veg-b  ")).toBe("veg-b");
  });

  it("prioritizes plants in the tent without dropping tent targets", () => {
    const partitioned = partitionQuickLogV2TargetOptionsForTent(options, "veg-b");
    expect(partitioned.inTentPlants.map((o) => o.id)).toEqual(["sg1", "sg2"]);
    expect(partitioned.ordered.slice(0, 2).map((o) => `${o.type}:${o.id}`)).toEqual([
      "plant:sg1",
      "plant:sg2",
    ]);
    // Tent targets remain somewhere in the list.
    expect(partitioned.ordered.some((o) => o.type === "tent" && o.id === "veg-b")).toBe(true);
    expect(partitioned.ordered.some((o) => o.type === "tent" && o.id === "clones")).toBe(true);
    expect(partitioned.ordered).toHaveLength(options.length);
  });

  it("leaves order unchanged when tent context is absent", () => {
    const partitioned = partitionQuickLogV2TargetOptionsForTent(options, null);
    expect(partitioned.ordered).toEqual(options);
    expect(partitioned.inTentPlants).toEqual([]);
  });

  it("filters targets by visible Plant · / Tent · label", () => {
    const filtered = filterQuickLogV2TargetOptions(options, "sg 2");
    expect(filtered.map((o) => o.id)).toEqual(["sg2"]);
    expect(formatQuickLogV2TargetOptionLabel(filtered[0]!)).toBe("Plant · SG 2");
    expect(filterQuickLogV2TargetOptions(options, "VEG").map((o) => o.id)).toEqual(["veg-b"]);
    expect(filterQuickLogV2TargetOptions(options, "   ")).toEqual(options);
  });

  it("auto-selects the sole plant in tent when selectedKey is still empty", () => {
    const soleOptions: QuickLogV2TargetOption[] = [
      { type: "tent", id: "clones", label: "Clones", tentId: "clones", growId: "g1" },
      { type: "plant", id: "c1", label: "Clone A", tentId: "clones", growId: "g1" },
    ];
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "clones",
        options: soleOptions,
        selectedKey: null,
        recentPlantId: null,
      }),
    ).toBe("plant:c1");
  });

  it("prefers a recent plant that belongs to the tent over sole-plant logic", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "veg-b",
        options,
        selectedKey: null,
        recentPlantId: "sg2",
      }),
    ).toBe("plant:sg2");
  });

  it("does not rewrite an explicit tent: selectedKey to a plant via sole auto-select", () => {
    const soleOptions: QuickLogV2TargetOption[] = [
      { type: "tent", id: "clones", label: "Clones", tentId: "clones", growId: "g1" },
      { type: "plant", id: "c1", label: "Clone A", tentId: "clones", growId: "g1" },
    ];
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "clones",
        options: soleOptions,
        selectedKey: "tent:clones",
        recentPlantId: null,
      }),
    ).toBeNull();
  });

  it("does not rewrite an explicit tent: selectedKey even when a recent plant is in the tent", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "veg-b",
        options,
        selectedKey: "tent:veg-b",
        recentPlantId: "sg2",
      }),
    ).toBeNull();
  });

  it("does not override an existing plant selection", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "veg-b",
        options,
        selectedKey: "plant:sg1",
        recentPlantId: "sg2",
      }),
    ).toBeNull();
  });

  it("ignores recent plants that are not in the tent", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "veg-b",
        options,
        selectedKey: null,
        recentPlantId: "c1",
      }),
    ).toBeNull();
  });

  it("keeps the filter threshold at 8 options", () => {
    expect(QUICK_LOG_V2_TARGET_FILTER_THRESHOLD).toBe(8);
  });
});

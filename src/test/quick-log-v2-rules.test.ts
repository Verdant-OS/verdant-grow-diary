import { describe, it, expect } from "vitest";
import {
  buildQuickLogV2TargetOptions,
  resolveQuickLogV2Target,
  shouldShowVolumeField,
  isPhotoSavingSupported,
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

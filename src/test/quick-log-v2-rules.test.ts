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
    expect(shouldShowVolumeField("photo")).toBe(false);
  });

  it("photo saving blocked in Gate 1", () => {
    expect(isPhotoSavingSupported()).toBe(false);
  });
});

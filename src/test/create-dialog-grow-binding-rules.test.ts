import { describe, it, expect } from "vitest";
import {
  resolveCreateTargetGrowId,
  buildCreateGrowBindingHardStop,
  canWriteCreateGrowId,
  evaluateTentGrowCompatibility,
  resolveInitialPlantTentId,
  resolveSetupName,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";

const grows = [
  { id: "g1", name: "Spring" },
  { id: "g2", name: "Fall" },
];

describe("resolveCreateTargetGrowId", () => {
  it("prefers page default when known", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: "g2",
        activeGrowId: "g1",
        grows,
      }),
    ).toBe("g2");
  });

  it("falls back to active grow when page default missing", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: null,
        activeGrowId: "g1",
        grows,
      }),
    ).toBe("g1");
  });

  it("ignores ids not in loaded grows", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: "ghost",
        activeGrowId: "ghost2",
        grows,
      }),
    ).toBeNull();
  });
});

describe("buildCreateGrowBindingHardStop", () => {
  it("blocks zero grows with Start your room path", () => {
    const v = buildCreateGrowBindingHardStop({ targetGrowId: null, growCount: 0 }, "plant");
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(true);
    expect(v.startRoomHref).toBe(GROW_SETUP_START_ROOM_HREF);
    expect(v.hardStopTitle).toMatch(/Start your room first/i);
    expect(v.hardStopBody).toMatch(/setup/i);
    expect(v.hardStopBody).not.toMatch(/grow_id|orphan|lineage/i);
  });

  it("blocks while loading with empty grow list", () => {
    const v = buildCreateGrowBindingHardStop(
      { targetGrowId: null, growCount: 0, growsLoading: true },
      "tent",
    );
    expect(v.blockSubmit).toBe(true);
    expect(v.showLoading).toBe(true);
    expect(v.showStartRoomHardStop).toBe(false);
  });

  it("blocks when grows exist but no resolvable target", () => {
    const v = buildCreateGrowBindingHardStop({ targetGrowId: null, growCount: 2 }, "tent");
    expect(v.blockSubmit).toBe(true);
    expect(v.showPickGrowHint).toBe(true);
  });

  it("allows submit when target is set", () => {
    const v = buildCreateGrowBindingHardStop({ targetGrowId: "g1", growCount: 1 }, "tent");
    expect(v.blockSubmit).toBe(false);
    expect(canWriteCreateGrowId("g1")).toBe(true);
    expect(canWriteCreateGrowId(null)).toBe(false);
  });
});

describe("tent compatibility", () => {
  it("allows none / empty tent selection", () => {
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "none",
        tentGrowId: null,
        targetGrowId: "g1",
      }).compatible,
    ).toBe(true);
  });

  it("rejects orphan tent when target known", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "t1",
      tentGrowId: null,
      targetGrowId: "g1",
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("orphan_tent");
    expect(r.clearTentSelection).toBe(true);
  });

  it("rejects mismatched tent grow", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "t1",
      tentGrowId: "g2",
      targetGrowId: "g1",
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("mismatch");
    expect(r.title).toMatch(/another setup/i);
  });

  it("accepts matching tent", () => {
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "t1",
        tentGrowId: "g1",
        targetGrowId: "g1",
      }).compatible,
    ).toBe(true);
  });

  it("resolveInitialPlantTentId drops incompatible default", () => {
    expect(
      resolveInitialPlantTentId({
        defaultTentId: "t-orphan",
        tentGrowId: null,
        targetGrowId: "g1",
      }),
    ).toBe("none");
    expect(
      resolveInitialPlantTentId({
        defaultTentId: "t1",
        tentGrowId: "g1",
        targetGrowId: "g1",
      }),
    ).toBe("t1");
  });
});

describe("resolveSetupName", () => {
  it("returns trimmed setup name when present", () => {
    expect(resolveSetupName("g1", grows)).toBe("Spring");
  });

  it("never leaks a raw UUID as the display name", () => {
    const uuidGrow = [
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      },
    ];
    expect(resolveSetupName("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", uuidGrow)).toBeNull();
  });

  it("handles blank or missing setup names", () => {
    expect(resolveSetupName("g1", [{ id: "g1", name: "   " }])).toBeNull();
    expect(resolveSetupName("g1", [{ id: "g1", name: null }])).toBeNull();
    expect(resolveSetupName("g1", [])).toBeNull();
  });

  it("handles very long setup names without truncation in resolver", () => {
    const longName = "A".repeat(200);
    expect(resolveSetupName("g1", [{ id: "g1", name: longName }])).toBe(longName);
  });
});

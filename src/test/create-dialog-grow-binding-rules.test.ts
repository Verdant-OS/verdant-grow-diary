import { describe, it, expect } from "vitest";
import {
  resolveCreateTargetGrowId,
  resolveTargetGrow,
  buildCreateGrowBindingHardStop,
  buildHardStopView,
  canWriteCreateGrowId,
  evaluateTentGrowCompatibility,
  checkTentGrowCompatibility,
  resolveInitialPlantTentId,
  formatDisplaySetupName,
  looksLikeOpaqueId,
  evaluateDefaultTentBinding,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_START_ROOM_HREF, growSetup } from "@/constants/growSetupMessages";

const grows = [
  { id: "g1", name: "Spring" },
  { id: "g2", name: "Fall" },
  { id: "g3", name: "a1b2c3d4-e5f6-4789-a012-3456789abcde" },
];

describe("resolveCreateTargetGrowId / resolveTargetGrow", () => {
  it("prefers page default when known", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: "g2",
        activeGrowId: "g1",
        grows,
      }),
    ).toBe("g2");
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "g2",
        activeGrowId: "g1",
        grows,
      }),
    ).toEqual({ id: "g2", name: "Fall" });
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
    expect(resolveTargetGrow({ pageDefaultGrowId: "ghost", grows })).toBeNull();
  });
});

describe("formatDisplaySetupName", () => {
  it("never leaks a raw UUID as the display label", () => {
    const label = formatDisplaySetupName("g3", grows);
    expect(label).toBe(growSetup.create.genericSetupLabel);
    expect(looksLikeOpaqueId(label)).toBe(false);
  });

  it("handles very long setup names without breaking", () => {
    const longName = "A".repeat(200);
    const label = formatDisplaySetupName("g1", [{ id: "g1", name: longName }]);
    expect(label).toBe(longName);
    expect(label.length).toBe(200);
  });

  it("handles blank or missing setup names with generic label", () => {
    expect(formatDisplaySetupName("g1", [{ id: "g1", name: "" }])).toBe(
      growSetup.create.genericSetupLabel,
    );
    expect(formatDisplaySetupName("g1", [{ id: "g1", name: "   " }])).toBe(
      growSetup.create.genericSetupLabel,
    );
    expect(formatDisplaySetupName("missing", grows)).toBe(growSetup.create.genericSetupLabel);
  });
});

describe("buildCreateGrowBindingHardStop / buildHardStopView", () => {
  it("blocks zero grows with Start your room path", () => {
    const v = buildCreateGrowBindingHardStop({ targetGrowId: null, growCount: 0 }, "plant");
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(true);
    expect(v.startRoomHref).toBe(GROW_SETUP_START_ROOM_HREF);
    expect(v.hardStopTitle).toMatch(/Start your room first/i);
    expect(v.hardStopBody).toMatch(/setup/i);
    expect(v.hardStopBody).not.toMatch(/grow_id|orphan|lineage/i);
    expect(v.hardStopAriaLabel).toBeTruthy();
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
    const v = buildCreateGrowBindingHardStop({ targetGrowId: "g1", growCount: 1, grows }, "tent");
    expect(v.blockSubmit).toBe(false);
    expect(canWriteCreateGrowId("g1")).toBe(true);
    expect(canWriteCreateGrowId(null)).toBe(false);
  });

  it("buildHardStopView alias matches target grow object", () => {
    const target = resolveTargetGrow({ activeGrowId: "g1", grows })!;
    const v = buildHardStopView({ targetGrow: target, growCount: 1, grows }, "plant");
    expect(v.blockSubmit).toBe(false);
    expect(v.hardStopAriaLabel).toMatch(/Spring/);
  });
});

describe("tent compatibility matrix", () => {
  it("allows none / empty tent selection", () => {
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "none",
        tentGrowId: null,
        targetGrowId: "g1",
      }).compatible,
    ).toBe(true);
  });

  it("rejects null tent grow with known target (missing_setup)", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "t1",
      tentGrowId: null,
      targetGrowId: "g1",
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("missing_setup");
    expect(r.clearTentSelection).toBe(true);
    expect(r.showFinishSetupCta).toBe(true);
  });

  it("rejects mismatched tent grow (different_setup)", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "t1",
      tentGrowId: "g2",
      targetGrowId: "g1",
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("different_setup");
    expect(r.title).toMatch(/another setup/i);
    expect(r.showFinishSetupCta).toBe(true);
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

  it("checkTentGrowCompatibility uses tent.grow_id", () => {
    const r = checkTentGrowCompatibility({
      targetGrowId: "g1",
      tent: { grow_id: null },
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("missing_setup");
  });

  it("evaluateDefaultTentBinding blocks supplied default tent on mismatch", () => {
    const r = evaluateDefaultTentBinding({
      defaultTentId: "t1",
      tentGrowId: null,
      targetGrowId: "g1",
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("missing_setup");
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

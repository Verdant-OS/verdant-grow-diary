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
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";

const grows = [
  { id: "g1", name: "Spring" },
  { id: "g2", name: "Fall" },
];

const UUID_NAME = "11111111-1111-4111-8111-111111111111";

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

describe("resolveTargetGrow", () => {
  it("returns id and display name without leaking raw ids", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: null,
        activeGrowId: "g1",
        grows,
      }),
    ).toEqual({ id: "g1", name: "Spring" });
  });

  it("falls back to Current setup for blank or uuid-looking names", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "g1",
        activeGrowId: null,
        grows: [{ id: "g1", name: "" }],
      }),
    ).toEqual({ id: "g1", name: "Current setup" });
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "g1",
        activeGrowId: null,
        grows: [{ id: "g1", name: UUID_NAME }],
      }),
    ).toEqual({ id: "g1", name: "Current setup" });
  });

  it("truncates very long setup names for display", () => {
    const longName = "A".repeat(120);
    const resolved = resolveTargetGrow({
      pageDefaultGrowId: "g1",
      activeGrowId: null,
      grows: [{ id: "g1", name: longName }],
    });
    expect(resolved?.name.length).toBeLessThanOrEqual(80);
    expect(resolved?.name.endsWith("…")).toBe(true);
  });
});

describe("buildHardStopView", () => {
  it("mirrors zero-grow and loading states", () => {
    expect(
      buildHardStopView({ targetGrow: null, growCount: 0, growsLoading: false }),
    ).toMatchObject({
      blockSubmit: true,
      showStartRoomHardStop: true,
      primaryLabel: "Start your room",
    });
    expect(
      buildHardStopView({ targetGrow: null, growCount: 0, growsLoading: true }),
    ).toMatchObject({
      blockSubmit: true,
      showLoading: true,
    });
  });

  it("never puts opaque ids in setupName", () => {
    const view = buildHardStopView({
      targetGrow: { id: "g1", name: "Current setup" },
      growCount: 1,
      growsLoading: false,
    });
    expect(view.setupName).toBe("Current setup");
    expect(view.setupName).not.toMatch(UUID_NAME);
  });
});

describe("checkTentGrowCompatibility", () => {
  it("maps tent/grow matrix to spec reasons", () => {
    expect(
      checkTentGrowCompatibility({ targetGrowId: "g1", tent: { grow_id: "g1" } }),
    ).toEqual({ ok: true });
    expect(
      checkTentGrowCompatibility({ targetGrowId: "g1", tent: { grow_id: null } }),
    ).toEqual({ ok: false, reason: "missing_setup" });
    expect(
      checkTentGrowCompatibility({ targetGrowId: "g1", tent: { grow_id: "g2" } }),
    ).toEqual({ ok: false, reason: "different_setup" });
    expect(checkTentGrowCompatibility({ targetGrowId: null, tent: { grow_id: "g1" } })).toEqual({
      ok: false,
      reason: "missing_target",
    });
  });
});

describe("buildCreateGrowBindingHardStop", () => {
  it("blocks zero grows with Start your room path", () => {
    const v = buildCreateGrowBindingHardStop(
      { targetGrowId: null, growCount: 0 },
      "plant",
    );
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
    const v = buildCreateGrowBindingHardStop(
      { targetGrowId: null, growCount: 2 },
      "tent",
    );
    expect(v.blockSubmit).toBe(true);
    expect(v.showPickGrowHint).toBe(true);
  });

  it("allows submit when target is set", () => {
    const v = buildCreateGrowBindingHardStop(
      { targetGrowId: "g1", growCount: 1 },
      "tent",
    );
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

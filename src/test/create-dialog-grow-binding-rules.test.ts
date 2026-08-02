import { describe, it, expect } from "vitest";
import {
  resolveCreateTargetGrowId,
  resolveTargetGrow,
  buildCreateGrowBindingView,
  buildHardStopView,
  canWriteCreateGrowId,
  checkTentGrowCompatibility,
  evaluateTentGrowCompatibility,
  evaluateSuppliedTentBinding,
  resolveInitialPlantTentId,
  resolveSetupName,
  plantCreateAllowsTentless,
  sanitizeSetupDisplayName,
  suppliedTentBlocksWrite,
} from "@/lib/createDialogGrowBindingRules";
import {
  GROW_SETUP_CHOOSE_SETUP_HREF,
  GROW_SETUP_FINISH_SETUP_HREF,
  GROW_SETUP_START_ROOM_HREF,
  growSetup,
} from "@/constants/growSetupMessages";

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
    ).toEqual({
      targetGrowId: "g2",
      requestedSetupUnavailable: false,
      explicitRequest: true,
    });
  });

  it("falls back to active grow only when no explicit page default", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: null,
        activeGrowId: "g1",
        grows,
      }).targetGrowId,
    ).toBe("g1");
  });

  it("does NOT fall back to active when explicit request is invalid", () => {
    const r = resolveCreateTargetGrowId({
      pageDefaultGrowId: "ghost",
      activeGrowId: "g1",
      grows,
    });
    expect(r.targetGrowId).toBeNull();
    expect(r.requestedSetupUnavailable).toBe(true);
    expect(r.explicitRequest).toBe(true);
  });

  it("fails closed when the requested id appears more than once", () => {
    const r = resolveCreateTargetGrowId({
      pageDefaultGrowId: "g1",
      activeGrowId: "g2",
      grows: [...grows, { id: "g1", name: "Duplicate" }],
    });
    expect(r.targetGrowId).toBeNull();
    expect(r.requestedSetupUnavailable).toBe(true);
  });

  it("uses generic presenter copy for blank or id-shaped setup names", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(resolveSetupName(id, [{ id, name: "" }])).toBe("your current setup");
    expect(resolveSetupName(id, [{ id, name: id }])).toBe("your current setup");
  });

  it("does not resolve a cached requested or active setup while grows refresh", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: "g2",
        activeGrowId: "g1",
        grows,
        growsLoading: true,
      }),
    ).toEqual({
      targetGrowId: null,
      requestedSetupUnavailable: false,
      explicitRequest: true,
    });

    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: null,
        activeGrowId: "g1",
        grows,
        growsLoading: true,
      }),
    ).toEqual({
      targetGrowId: null,
      requestedSetupUnavailable: false,
      explicitRequest: false,
    });
  });
});

describe("buildCreateGrowBindingView", () => {
  it("blocks zero grows with Start your room path", () => {
    const v = buildCreateGrowBindingView(
      { pageDefaultGrowId: null, activeGrowId: null, grows: [] },
      "plant",
    );
    expect(v.kind).toBe("no_setup");
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(true);
    expect(v.startRoomHref).toBe(GROW_SETUP_START_ROOM_HREF);
    expect(v.title).toMatch(/Start your room first/i);
    expect(v.body).not.toMatch(/grow_id|orphan|lineage/i);
  });

  it("distinguishes a settled grow read error from zero-setup", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: null,
        activeGrowId: null,
        grows: [],
        growsError: true,
      },
      "tent",
    );
    expect(v.kind).toBe("read_error");
    expect(v.showStartRoomHardStop).toBe(false);
    expect(v.showReadError).toBe(true);
    expect(v.title).toMatch(/unavailable/i);
    expect(v.retryLabel).toMatch(/Retry/i);
  });

  it("shows loading while retrying after a settled grow read error", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: "g1",
        activeGrowId: "g1",
        grows,
        growsLoading: true,
        growsError: true,
      },
      "plant",
    );
    expect(v.kind).toBe("loading");
    expect(v.blockSubmit).toBe(true);
    expect(v.targetGrowId).toBeNull();
    expect(v.showLoading).toBe(true);
    expect(v.showReadError).toBe(false);
    expect(v.showStartRoomHardStop).toBe(false);
  });

  it("blocks while loading with empty grow list", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: null,
        activeGrowId: null,
        grows: [],
        growsLoading: true,
      },
      "tent",
    );
    expect(v.kind).toBe("loading");
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(false);
  });

  it("blocks while refreshing a cached valid setup", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: "g2",
        activeGrowId: "g1",
        grows,
        growsLoading: true,
      },
      "plant",
    );
    expect(v.kind).toBe("loading");
    expect(v.blockSubmit).toBe(true);
    expect(v.targetGrowId).toBeNull();
    expect(v.showLoading).toBe(true);
    expect(canWriteCreateGrowId(v.targetGrowId)).toBe(false);
  });

  it("keeps an invalid explicit setup in loading state until refresh settles", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: "ghost",
        activeGrowId: "g1",
        grows,
        growsLoading: true,
      },
      "plant",
    );
    expect(v.kind).toBe("loading");
    expect(v.blockSubmit).toBe(true);
    expect(v.targetGrowId).toBeNull();
    expect(v.showRequestedUnavailable).toBe(false);
    expect(v.showPickGrowHint).toBe(false);
  });

  it("blocks when grows exist but no resolvable target", () => {
    const v = buildCreateGrowBindingView(
      { pageDefaultGrowId: null, activeGrowId: null, grows },
      "tent",
    );
    expect(v.kind).toBe("choose_setup");
    expect(v.blockSubmit).toBe(true);
  });

  it("allows submit when target is set", () => {
    const v = buildCreateGrowBindingView(
      { pageDefaultGrowId: "g1", activeGrowId: null, grows },
      "tent",
    );
    expect(v.kind).toBe("ready");
    expect(v.blockSubmit).toBe(false);
    expect(canWriteCreateGrowId(v.targetGrowId)).toBe(true);
  });

  it("requested unavailable never reports active as target", () => {
    const v = buildCreateGrowBindingView(
      { pageDefaultGrowId: "ghost", activeGrowId: "g1", grows },
      "plant",
    );
    expect(v.kind).toBe("requested_setup_unavailable");
    expect(v.targetGrowId).toBeNull();
    expect(v.chooseSetupHref).toBe(GROW_SETUP_CHOOSE_SETUP_HREF);
  });
});

describe("supplied tent contract", () => {
  it("keeps supplied tent pending while tents load", () => {
    const s = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoading: true,
      tentsLoaded: false,
      targetGrowId: "g1",
    });
    expect(s.kind).toBe("pending");
    expect(s.blockSubmit).toBe(true);
    expect(s.tentId).toBe("t1");
  });

  it("keeps supplied tent pending while cached tents refetch (isFetching)", () => {
    const s = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoading: false,
      tentsFetching: true,
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: "g1" },
      targetGrowId: "g1",
    });
    expect(s.kind).toBe("pending");
    expect(s.blockSubmit).toBe(true);
    expect(s.tentId).toBe("t1");
    expect(suppliedTentBlocksWrite(s, false)).toBe(true);
  });

  it("blocks tent read error with retry and forbids replacement escape", () => {
    const s = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsError: true,
      tentsLoaded: true,
      targetGrowId: "g1",
    });
    expect(s.kind).toBe("unavailable");
    expect(s.showRetry).toBe(true);
    expect(s.blockSubmit).toBe(true);
    expect(s.allowCompatibleReplacement).toBe(false);
    expect(suppliedTentBlocksWrite(s, true)).toBe(true);
    expect(suppliedTentBlocksWrite(s, true, { replacementIsLocallyVerified: true })).toBe(true);
  });

  it("missing tent after successful load allows explicit compatible replacement only", () => {
    const s = evaluateSuppliedTentBinding({
      suppliedTentId: "ghost",
      tentsLoaded: true,
      tentsLoading: false,
      suppliedTentRow: null,
      targetGrowId: "g1",
    });
    expect(s.kind).toBe("unavailable");
    expect(s.allowCompatibleReplacement).toBe(true);
    expect(suppliedTentBlocksWrite(s, false)).toBe(true);
    expect(suppliedTentBlocksWrite(s, true)).toBe(false);
  });

  it("blocks orphan/mismatch without clearing to tentless", () => {
    const orphan = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: null },
      targetGrowId: "g1",
    });
    expect(orphan.kind).toBe("orphan");
    expect(orphan.allowCompatibleReplacement).toBe(true);
    expect(suppliedTentBlocksWrite(orphan, false)).toBe(true);
    expect(suppliedTentBlocksWrite(orphan, true)).toBe(false);

    const mismatch = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: "g2" },
      targetGrowId: "g1",
    });
    expect(mismatch.kind).toBe("mismatch");
    expect(mismatch.allowCompatibleReplacement).toBe(true);
  });

  it("resolveInitialPlantTentId clears a supplied id while pending", () => {
    expect(
      resolveInitialPlantTentId({
        defaultTentId: "t1",
        tentsLoading: true,
        tentsLoaded: false,
        targetGrowId: "g1",
      }),
    ).toBe("none");
  });

  it("requireTentForWrite blocks none when supplied", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "none",
      tentGrowId: null,
      targetGrowId: "g1",
      requireTentForWrite: true,
    });
    expect(r.compatible).toBe(false);
    expect(r.kind).toBe("required_missing");
    expect(plantCreateAllowsTentless({ suppliedTentId: "t1" })).toBe(false);
  });

  it("pending never clears via explicitCompatiblePick alone", () => {
    const pending = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsFetching: true,
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: "g1" },
      targetGrowId: "g1",
    });
    expect(pending.kind).toBe("pending");
    expect(suppliedTentBlocksWrite(pending, true)).toBe(true);
    expect(suppliedTentBlocksWrite(pending, true, { replacementIsLocallyVerified: true })).toBe(
      false,
    );
  });

  it("orphan/mismatch supplied tents expose Finish setup href", () => {
    const orphan = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: null },
      targetGrowId: "g1",
    });
    expect(orphan.kind).toBe("orphan");
    expect(orphan.finishSetupHref).toBe(GROW_SETUP_FINISH_SETUP_HREF);

    const mismatch = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: "g2" },
      targetGrowId: "g1",
    });
    expect(mismatch.kind).toBe("mismatch");
    expect(mismatch.finishSetupHref).toBe(GROW_SETUP_FINISH_SETUP_HREF);
  });
});

describe("resolveTargetGrow / display-name safety", () => {
  it("returns id+name and never leaks a raw UUID", () => {
    const uuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(sanitizeSetupDisplayName(uuid, uuid)).toBe(growSetup.create.genericSetupLabel);
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: uuid,
        activeGrowId: null,
        grows: [{ id: uuid, name: uuid }],
      })?.name,
    ).toBe(growSetup.create.genericSetupLabel);
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: null,
        activeGrowId: "g1",
        grows,
      }),
    ).toEqual({ id: "g1", name: "Spring" });
  });

  it("handles blank and very long setup names", () => {
    expect(sanitizeSetupDisplayName("   ", "g1")).toBe(growSetup.create.genericSetupLabel);
    const long = "A".repeat(120);
    expect(sanitizeSetupDisplayName(long, "g1").length).toBeLessThanOrEqual(80);
  });
});

describe("checkTentGrowCompatibility / buildHardStopView", () => {
  it("covers the tent/grow compatibility matrix", () => {
    expect(checkTentGrowCompatibility({ targetGrowId: "g1", tent: null }).ok).toBe(true);
    expect(
      checkTentGrowCompatibility({
        targetGrowId: "g1",
        tent: { id: "t1", grow_id: null },
      }),
    ).toEqual({ ok: false, reason: "missing_setup" });
    expect(
      checkTentGrowCompatibility({
        targetGrowId: "g1",
        tent: { id: "t1", growId: "g2" },
      }),
    ).toEqual({ ok: false, reason: "different_setup" });
    expect(
      checkTentGrowCompatibility({
        targetGrowId: null,
        tent: { id: "t1", grow_id: "g1" },
      }),
    ).toEqual({ ok: false, reason: "missing_target" });
    expect(
      checkTentGrowCompatibility({
        targetGrowId: "g1",
        tent: { id: "t1", grow_id: "g1" },
      }).ok,
    ).toBe(true);
  });

  it("buildHardStopView blocks zero grows", () => {
    const v = buildHardStopView({
      targetGrow: null,
      growCount: 0,
      entity: "plant",
    });
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(true);
    expect(canWriteCreateGrowId(null)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  resolveCreateTargetGrowId,
  resolveTargetGrow,
  buildCreateGrowBindingView,
  buildHardStopView,
  canWriteCreateGrowId,
  evaluateTentGrowCompatibility,
  checkTentGrowCompatibility,
  evaluateSuppliedTentBinding,
  resolveInitialPlantTentId,
  plantCreateAllowsTentless,
  suppliedTentBlocksWrite,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";

const grows = [
  { id: "g1", name: "Spring" },
  { id: "g2", name: "Fall" },
];

const UUID_NAME = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("resolveTargetGrow (spec API)", () => {
  it("returns id and display name when page default is known", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "g2",
        activeGrowId: "g1",
        grows,
      }),
    ).toEqual({ id: "g2", name: "Fall" });
  });

  it("never leaks a raw UUID as the setup display name", () => {
    const target = resolveTargetGrow({
      pageDefaultGrowId: UUID_NAME,
      activeGrowId: null,
      grows: [{ id: UUID_NAME, name: UUID_NAME }],
    });
    expect(target?.name).toBe("your setup");
    expect(target?.name).not.toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("uses generic label when setup name is blank", () => {
    const target = resolveTargetGrow({
      pageDefaultGrowId: "g-blank",
      activeGrowId: null,
      grows: [{ id: "g-blank", name: "   " }],
    });
    expect(target?.name).toBe("your setup");
  });
});

describe("buildHardStopView (spec API)", () => {
  it("mirrors no_setup hard stop for zero grows", () => {
    const v = buildHardStopView(
      { pageDefaultGrowId: null, activeGrowId: null, grows: [] },
      "plant",
    );
    expect(v.blockSubmit).toBe(true);
    expect(v.showStartRoomHardStop).toBe(true);
    expect(v.startRoomHref).toBe(GROW_SETUP_START_ROOM_HREF);
    expect(v.title).toMatch(/Start your room first/i);
    expect(v.ariaLabel.length).toBeGreaterThan(0);
  });
});

describe("checkTentGrowCompatibility (spec API)", () => {
  it("accepts matching tent", () => {
    expect(
      checkTentGrowCompatibility({
        targetGrowId: "g1",
        tent: { id: "t1", grow_id: "g1" },
      }).ok,
    ).toBe(true);
  });

  it("rejects orphan tent when target known", () => {
    const check = checkTentGrowCompatibility({
      targetGrowId: "g1",
      tent: { id: "t1", grow_id: null },
    });
    expect(check.ok).toBe(false);
    if (check.ok === false) expect(check.reason).toBe("missing_setup");
  });

  it("rejects mismatched tent grow", () => {
    const check = checkTentGrowCompatibility({
      targetGrowId: "g1",
      tent: { id: "t1", grow_id: "g2" },
    });
    expect(check.ok).toBe(false);
    if (check.ok === false) expect(check.reason).toBe("different_setup");
  });
});

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

  it("distinguishes grow read error from zero-setup", () => {
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

  it("resolveInitialPlantTentId preserves supplied id while pending", () => {
    expect(
      resolveInitialPlantTentId({
        defaultTentId: "t1",
        tentsLoading: true,
        tentsLoaded: false,
        targetGrowId: "g1",
      }),
    ).toBe("t1");
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
  });
});

import { describe, it, expect } from "vitest";
import {
  resolveCreateTargetGrowId,
  buildCreateGrowBindingView,
  canWriteCreateGrowId,
  evaluateTentGrowCompatibility,
  evaluateSuppliedTentBinding,
  plantCreateAllowsTentless,
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
      }).targetGrowId,
    ).toBe("g2");
  });

  it("falls back to active grow only when page default is absent", () => {
    expect(
      resolveCreateTargetGrowId({
        pageDefaultGrowId: null,
        activeGrowId: "g1",
        grows,
      }).targetGrowId,
    ).toBe("g1");
  });

  it("does NOT fall back when explicit request is unknown", () => {
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
  });

  it("blocks loading without claiming zero setup", () => {
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
    expect(v.showStartRoomHardStop).toBe(false);
    expect(v.showLoading).toBe(true);
  });

  it("blocks read_error without Start your room CTA", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: null,
        activeGrowId: null,
        grows: [],
        growsError: true,
      },
      "plant",
    );
    expect(v.kind).toBe("read_error");
    expect(v.showReadError).toBe(true);
    expect(v.showStartRoomHardStop).toBe(false);
    expect(v.title).toMatch(/unavailable/i);
  });

  it("blocks requested_setup_unavailable without active fallback", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: "ghost",
        activeGrowId: "g1",
        grows,
      },
      "tent",
    );
    expect(v.kind).toBe("requested_setup_unavailable");
    expect(v.targetGrowId).toBeNull();
    expect(v.blockSubmit).toBe(true);
  });

  it("allows ready when target resolves", () => {
    const v = buildCreateGrowBindingView(
      {
        pageDefaultGrowId: "g1",
        activeGrowId: "g2",
        grows,
      },
      "tent",
    );
    expect(v.kind).toBe("ready");
    expect(v.blockSubmit).toBe(false);
    expect(canWriteCreateGrowId(v.targetGrowId)).toBe(true);
  });
});

describe("supplied tent binding", () => {
  it("pending while tents load — blocks write, keeps tent id", () => {
    const r = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoading: true,
      tentsLoaded: false,
      targetGrowId: "g1",
    });
    expect(r.kind).toBe("pending");
    expect(r.blockSubmit).toBe(true);
    expect(r.tentId).toBe("t1");
    expect(r.requireCompatibleTentSelection).toBe(true);
  });

  it("unavailable on tent read error — blocks write", () => {
    const r = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsError: true,
      tentsLoaded: true,
      targetGrowId: "g1",
    });
    expect(r.kind).toBe("unavailable");
    expect(r.blockSubmit).toBe(true);
    expect(r.showRetry).toBe(true);
  });

  it("orphan/mismatch retain blocked presenter — no silent none", () => {
    expect(
      evaluateSuppliedTentBinding({
        suppliedTentId: "t1",
        tentsLoaded: true,
        suppliedTentRow: { id: "t1", grow_id: null },
        targetGrowId: "g1",
      }).kind,
    ).toBe("orphan");
    expect(
      evaluateSuppliedTentBinding({
        suppliedTentId: "t1",
        tentsLoaded: true,
        suppliedTentRow: { id: "t1", grow_id: "g2" },
        targetGrowId: "g1",
      }).kind,
    ).toBe("mismatch");
  });

  it("ready when tent matches target", () => {
    const r = evaluateSuppliedTentBinding({
      suppliedTentId: "t1",
      tentsLoaded: true,
      suppliedTentRow: { id: "t1", grow_id: "g1" },
      targetGrowId: "g1",
    });
    expect(r.kind).toBe("ready");
    expect(r.blockSubmit).toBe(false);
  });

  it("Add Plant to This Tent cannot become tentless", () => {
    expect(plantCreateAllowsTentless({ suppliedTentId: "t1" })).toBe(false);
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "none",
        tentGrowId: null,
        targetGrowId: "g1",
        requireTentForWrite: true,
      }).kind,
    ).toBe("required_missing");
  });
});

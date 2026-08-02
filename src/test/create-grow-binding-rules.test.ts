import { describe, expect, it } from "vitest";
import {
  buildCreateGrowBindingView,
  evaluateSuppliedTentBinding,
  evaluateTentGrowCompatibility,
  resolveCreateTargetGrowId,
  resolveSetupName,
} from "@/lib/createDialogGrowBindingRules";

const grows = [
  { id: "g1", name: "North Room" },
  { id: "g2", name: "South Room" },
];

describe("canonical create grow binding", () => {
  it("returns loading before considering cached rows", () => {
    expect(
      buildCreateGrowBindingView({ grows, growsLoading: true, activeGrowId: "g1" }, "tent").kind,
    ).toBe("loading");
  });

  it("returns read_error instead of no_setup", () => {
    const state = buildCreateGrowBindingView({ grows: [], growsError: true }, "plant");
    expect(state.kind).toBe("read_error");
    expect(state.showStartRoomHardStop).toBe(false);
  });

  it("returns no_setup only after a successful empty read", () => {
    expect(buildCreateGrowBindingView({ grows: [] }, "plant").kind).toBe("no_setup");
  });

  it("uses a valid requested setup", () => {
    const result = resolveCreateTargetGrowId({
      pageDefaultGrowId: "g2",
      activeGrowId: "g1",
      grows,
    });
    expect(result.targetGrowId).toBe("g2");
  });

  it("never falls back from an invalid requested setup", () => {
    const result = resolveCreateTargetGrowId({
      pageDefaultGrowId: "missing",
      activeGrowId: "g1",
      grows,
    });
    expect(result.targetGrowId).toBeNull();
    expect(result.requestedSetupUnavailable).toBe(true);
  });

  it("uses the active setup only when there is no request", () => {
    expect(resolveCreateTargetGrowId({ activeGrowId: "g1", grows }).targetGrowId).toBe("g1");
  });

  it("requires setup choice when the active id is stale", () => {
    expect(buildCreateGrowBindingView({ activeGrowId: "missing", grows }, "tent").kind).toBe(
      "choose_setup",
    );
  });

  it("never renders an id-shaped value as the setup name", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(resolveSetupName(id, [{ id, name: id }])).toBe("your current setup");
  });

  it("fails closed for duplicate ids and is stable under reordering", () => {
    const duplicateRows = [...grows, { id: "g1", name: "Duplicate" }];
    const first = resolveCreateTargetGrowId({ pageDefaultGrowId: "g1", grows: duplicateRows });
    const second = resolveCreateTargetGrowId({
      pageDefaultGrowId: "g1",
      grows: [...duplicateRows].reverse(),
    });
    expect(first).toEqual(second);
    expect(first.targetGrowId).toBeNull();
  });
});

describe("canonical plant tent compatibility", () => {
  it("allows no tent only outside a guided tent requirement", () => {
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: null,
        tentGrowId: null,
        targetGrowId: "g1",
      }).compatible,
    ).toBe(true);
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: null,
        tentGrowId: null,
        targetGrowId: "g1",
        requireTentForWrite: true,
      }).kind,
    ).toBe("required_missing");
  });

  it("accepts a matching tent", () => {
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "t1",
        tentGrowId: "g1",
        targetGrowId: "g1",
      }).compatible,
    ).toBe(true);
  });

  it("blocks null-linked and different-setup tents", () => {
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "t1",
        tentGrowId: null,
        targetGrowId: "g1",
      }).kind,
    ).toBe("orphan_tent");
    expect(
      evaluateTentGrowCompatibility({
        selectedTentId: "t1",
        tentGrowId: "g2",
        targetGrowId: "g1",
      }).kind,
    ).toBe("mismatch");
  });

  it("blocks a supplied id missing from the loaded tent rows", () => {
    expect(
      evaluateSuppliedTentBinding({
        suppliedTentId: "missing",
        targetGrowId: "g1",
        tentsLoaded: true,
        suppliedTentRow: null,
      }).kind,
    ).toBe("unavailable");
  });
});

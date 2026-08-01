import { describe, it, expect } from "vitest";
import {
  evaluateSuppliedTentBinding,
  evaluateTentGrowCompatibility,
  plantCreateAllowsTentless,
} from "@/lib/createDialogGrowBindingRules";

describe("create plant tent compatibility", () => {
  it("supplied tent never allows tentless escape", () => {
    expect(plantCreateAllowsTentless({ suppliedTentId: "t1" })).toBe(false);
  });

  it("pending/error/conflict block submit with zero silent clear-to-none", () => {
    for (const r of [
      evaluateSuppliedTentBinding({
        suppliedTentId: "t1",
        tentsLoading: true,
        tentsLoaded: false,
        targetGrowId: "g1",
      }),
      evaluateSuppliedTentBinding({
        suppliedTentId: "t1",
        tentsError: true,
        tentsLoaded: true,
        targetGrowId: "g1",
      }),
      evaluateSuppliedTentBinding({
        suppliedTentId: "t1",
        tentsLoaded: true,
        suppliedTentRow: { id: "t1", grow_id: null },
        targetGrowId: "g1",
      }),
    ]) {
      expect(r.blockSubmit).toBe(true);
      expect(r.tentId).toBe("t1");
    }
  });

  it("requireTentForWrite blocks none selection", () => {
    const r = evaluateTentGrowCompatibility({
      selectedTentId: "none",
      tentGrowId: null,
      targetGrowId: "g1",
      requireTentForWrite: true,
    });
    expect(r.compatible).toBe(false);
    expect(r.blockSubmit).toBe(true);
  });
});

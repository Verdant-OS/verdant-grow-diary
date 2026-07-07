/**
 * Part B (B4) — pure cross-form presenter.
 *
 * Locks the reproduction UI logic that lives OUT of JSX: deriving the pending
 * cross type from the selection + reversal set, the submit-disabled reasons,
 * the S1 donor label, and the lineage badges.
 */
import { describe, it, expect } from "vitest";
import {
  buildCrossFormViewModel,
  crossLineageBadge,
  crossDonorLabel,
  REVERSAL_METHOD_OPTIONS,
  SELF_DONOR_VALUE,
} from "@/lib/phenoCrossFormViewModel";

describe("buildCrossFormViewModel", () => {
  it("blocks with a reason until the female keeper is chosen", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "",
      donorSelection: "k2",
      reversedKeeperIds: [],
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.disabledReason).toMatch(/female/i);
  });

  it("blocks with 'Select a donor keeper.' when a female but no donor is chosen", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: "",
      reversedKeeperIds: [],
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.disabledReason).toMatch(/donor/i);
  });

  it("a non-reversed distinct donor → standard F1, pollen carried", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: "k2",
      reversedKeeperIds: [],
    });
    expect(vm.canSubmit).toBe(true);
    expect(vm.isSelf).toBe(false);
    expect(vm.pollenKeeperId).toBe("k2");
    expect(vm.previewBadge).toBe("F1");
  });

  it("a reversed distinct donor → feminized cross", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: "k2",
      reversedKeeperIds: ["k2"],
    });
    expect(vm.canSubmit).toBe(true);
    expect(vm.previewBadge).toMatch(/Feminized/);
  });

  it("selfing a reversed keeper (SELF sentinel) → S1, null pollen", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: SELF_DONOR_VALUE,
      reversedKeeperIds: ["k1"],
    });
    expect(vm.isSelf).toBe(true);
    expect(vm.canSubmit).toBe(true);
    expect(vm.pollenKeeperId).toBeNull();
    expect(vm.previewBadge).toMatch(/S1/);
  });

  it("choosing the mother as her own donor is treated as selfing", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: "k1",
      reversedKeeperIds: ["k1"],
    });
    expect(vm.isSelf).toBe(true);
    expect(vm.pollenKeeperId).toBeNull();
  });

  it("selfing an UNREVERSED keeper is blocked with a reversal reason", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: SELF_DONOR_VALUE,
      reversedKeeperIds: [],
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.disabledReason).toMatch(/revers/i);
  });
});

describe("crossLineageBadge", () => {
  it("maps each cross type to a badge", () => {
    expect(crossLineageBadge("standard_f1")).toBe("F1");
    expect(crossLineageBadge("feminized_cross")).toMatch(/Feminized/);
    expect(crossLineageBadge("selfing_s1")).toMatch(/S1/);
    expect(crossLineageBadge("mystery")).toBe("Cross");
  });
});

describe("crossDonorLabel", () => {
  it("renders Self for a selfing / null-male row, never blank", () => {
    expect(crossDonorLabel({ maleKeeperId: null, crossType: "selfing_s1" }, null)).toBe("Self");
    expect(crossDonorLabel({ maleKeeperId: null, crossType: "standard_f1" }, "ignored")).toBe(
      "Self",
    );
  });

  it("renders the donor name for a two-parent cross, with a safe fallback", () => {
    expect(crossDonorLabel({ maleKeeperId: "k2", crossType: "standard_f1" }, "Dessert")).toBe(
      "Dessert",
    );
    expect(crossDonorLabel({ maleKeeperId: "k2", crossType: "standard_f1" }, null)).toBe(
      "unknown keeper",
    );
  });
});

describe("REVERSAL_METHOD_OPTIONS", () => {
  it("offers exactly the four DB-recognized methods with labels", () => {
    expect(REVERSAL_METHOD_OPTIONS.map((o) => o.value)).toEqual([
      "sts",
      "colloidal_silver",
      "ga3",
      "other",
    ]);
    for (const o of REVERSAL_METHOD_OPTIONS) expect(o.label.length).toBeGreaterThan(0);
  });
});

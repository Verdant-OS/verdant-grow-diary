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

  it("treats a stale female id (not in the current hunt's keepers) as unselected", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "from-other-hunt",
      donorSelection: "also-other-hunt",
      reversedKeeperIds: [],
      validKeeperIds: ["k1", "k2"], // current hunt only
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.disabledReason).toMatch(/female/i);
  });

  it("drops a stale donor id but keeps a valid female", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: "stale-donor",
      reversedKeeperIds: [],
      validKeeperIds: ["k1", "k2"],
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.disabledReason).toMatch(/donor/i);
  });

  it("still allows a valid in-hunt selection when validKeeperIds is provided", () => {
    const vm = buildCrossFormViewModel({
      femaleKeeperId: "k1",
      donorSelection: "k2",
      reversedKeeperIds: [],
      validKeeperIds: ["k1", "k2"],
    });
    expect(vm.canSubmit).toBe(true);
    expect(vm.previewBadge).toBe("F1");
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

  it("shows the taxonomy label for the new ways (no generation -> the minimum for that way)", () => {
    // James Loud review: a badge with no real generation must never claim a
    // specific one it doesn't have — falls back to crossTypeDisplay's minimum
    // (F2 for filial, BX1 for backcross), which is unreachable for real stored
    // rows since the DB CHECK requires a generation on these types.
    expect(crossLineageBadge("filial")).toBe("F2");
    expect(crossLineageBadge("backcross")).toBe("BX1");
    expect(crossLineageBadge("feminized_bx")).toBe("Fem BX1");
    expect(crossLineageBadge("open_pollination")).toBe("OP");
  });

  it("James Loud review #4/#5: shows the REAL generation, not a generic base badge", () => {
    // An F5 must never render identically to an F2, and a BX3 must never
    // render identically to a BX1 — a breeder reads generation depth off this
    // badge (stabilization / how many backcross cycles).
    expect(crossLineageBadge("filial", 5)).toBe("F5");
    expect(crossLineageBadge("filial", 2)).toBe("F2");
    expect(crossLineageBadge("selfing_sn", 4)).toBe("S4");
    expect(crossLineageBadge("backcross", 3)).toBe("BX3");
    expect(crossLineageBadge("feminized_bx", 2)).toBe("Fem BX2");
  });

  it("James Loud review #6: a feminized filial/backcross is marked Fem, never shown as regular", () => {
    // A feminized F2/BX (reversal-channel donor) must be visually distinct from
    // a regular mixed-sex one — a breeder planting it expects ~all-female, not
    // a normal sex ratio to cull.
    expect(crossLineageBadge("filial", 3, "sts")).toBe("Fem F3");
    expect(crossLineageBadge("filial", 3, "colloidal_silver")).toBe("Fem F3");
    expect(crossLineageBadge("filial", 3, "rodelization")).toBe("Fem F3");
    expect(crossLineageBadge("backcross", 2, "sts")).toBe("Fem BX2");
    // A NATURAL-male filial/backcross is unmarked (regular, as expected).
    expect(crossLineageBadge("filial", 3, "natural_male")).toBe("F3");
    expect(crossLineageBadge("backcross", 2, null)).toBe("BX2");
    // Other ways never carry the Fem marker (they can't be feminized at all —
    // validateBreedingCross forbids a reversal channel on them).
    expect(crossLineageBadge("sib_cross", null, "sts")).toBe("Sib");
    // Inherently-feminized ways already say so without a Fem prefix stacked on.
    expect(crossLineageBadge("feminized_bx", 1, "sts")).toBe("Fem BX1");
  });
});

describe("crossDonorLabel", () => {
  it("renders Self for a selfing row (S1 or Sn)", () => {
    expect(crossDonorLabel({ maleKeeperId: null, crossType: "selfing_s1" }, null)).toBe("Self");
    expect(crossDonorLabel({ maleKeeperId: null, crossType: "selfing_sn" }, null)).toBe("Self");
  });

  it("renders 'Open pollination' for an open-pollination row with no named donor", () => {
    expect(crossDonorLabel({ maleKeeperId: null, crossType: "open_pollination" }, null)).toBe(
      "Open pollination",
    );
  });

  it("renders the donor name for a two-parent cross, with a safe fallback", () => {
    expect(crossDonorLabel({ maleKeeperId: "k2", crossType: "standard_f1" }, "Dessert")).toBe(
      "Dessert",
    );
    expect(crossDonorLabel({ maleKeeperId: "k2", crossType: "standard_f1" }, null)).toBe(
      "unknown keeper",
    );
    // An anomalous null-male non-selfing row no longer mislabels as "Self".
    expect(crossDonorLabel({ maleKeeperId: null, crossType: "standard_f1" }, null)).toBe(
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

// Tranche B+ PR-B1 — shared Quick Log target precedence contract.
//
// The precedence order and the hold/manual-selection decision are encoded
// once, purely, so every Quick Log surface can converge on the same rules
// without each presenter re-deriving them. This suite pins BOTH the
// precedence data and today's exact semantics, so the first consumer
// (legacy QuickLog) provably changes no behavior.
import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_TARGET_PRECEDENCE,
  resolveQuickLogTargetPlan,
} from "@/lib/quickLogTargetResolutionRules";

const READY = {
  status: "ready" as const,
  target: { plantId: "plant-1", growId: "grow-1", tentId: "tent-1" },
};
const BLOCKED = { status: "blocked" as const, reason: "plant_not_found" };
const PENDING = { status: "blocked" as const, reason: "prefill_target_pending" };

describe("QUICK_LOG_TARGET_PRECEDENCE", () => {
  it("orders a named request above the grower's own selection", () => {
    expect(QUICK_LOG_TARGET_PRECEDENCE).toEqual(["named-request", "explicit-grower-selection"]);
  });

  it("declares only the tiers this module can actually enforce", () => {
    // Renegotiated from a three-tier list. `AppShell` collapses "explicit
    // intent" and "route context" into one `prefill` prop before Quick Log
    // sees it, so the editor cannot tell them apart and a three-tier export
    // would advertise an ordering nothing consults. Splitting them needs
    // AppShell.tsx — Tranche A slice A5's surface.
    expect(QUICK_LOG_TARGET_PRECEDENCE).toHaveLength(2);
    const asStrings: readonly string[] = QUICK_LOG_TARGET_PRECEDENCE;
    expect(asStrings).not.toContain("route-context");
    expect(asStrings).not.toContain("explicit-prefill-or-intent");
  });

  it("has no remembered-default tier — remembered targets are never a fallback", () => {
    const asStrings: readonly string[] = QUICK_LOG_TARGET_PRECEDENCE;
    expect(asStrings.some((tier) => /remember|last|recent|previous/i.test(tier))).toBe(false);
    // Only a visible, explicitly-chosen suggestion may ever reintroduce a
    // remembered target, and it enters through explicit-grower-selection.
  });

  it("is the list the resolver actually reports from — not a decorative export", () => {
    const tiers: readonly string[] = QUICK_LOG_TARGET_PRECEDENCE;
    const plans = [
      resolveQuickLogTargetPlan({
        requestKey: "plant:plant-1",
        prefillResolution: READY,
        dismissedBlockedPrefillKey: null,
        manualPlantId: "",
      }),
      resolveQuickLogTargetPlan({
        requestKey: "plant:ghost",
        prefillResolution: BLOCKED,
        dismissedBlockedPrefillKey: null,
        manualPlantId: "",
      }),
      resolveQuickLogTargetPlan({
        requestKey: null,
        prefillResolution: BLOCKED,
        dismissedBlockedPrefillKey: null,
        manualPlantId: "plant-9",
      }),
      resolveQuickLogTargetPlan({
        requestKey: "plant:ghost",
        prefillResolution: BLOCKED,
        dismissedBlockedPrefillKey: "plant:ghost",
        manualPlantId: "plant-9",
      }),
    ];
    for (const plan of plans) expect(tiers).toContain(plan.tier);
    // And the ordering is observable: a live named request wins, a dismissed
    // one drops to the grower's tier.
    expect(plans.map((plan) => plan.tier)).toEqual([
      "named-request",
      "named-request",
      "explicit-grower-selection",
      "explicit-grower-selection",
    ]);
  });
});

describe("resolveQuickLogTargetPlan — hold semantics", () => {
  it("applies a proven named target, carrying its grow", () => {
    const plan = resolveQuickLogTargetPlan({
      requestKey: "plant:plant-1",
      prefillResolution: READY,
      dismissedBlockedPrefillKey: null,
      manualPlantId: "",
    });
    expect(plan).toEqual({
      step: "apply-named",
      tier: "named-request",
      plantId: "plant-1",
      growId: "grow-1",
      holdActive: true,
      editorPlantId: "plant-1",
    });
  });

  it("holds the editor empty when a named target cannot be proven", () => {
    for (const resolution of [BLOCKED, PENDING]) {
      const plan = resolveQuickLogTargetPlan({
        requestKey: "plant:ghost",
        prefillResolution: resolution,
        dismissedBlockedPrefillKey: null,
        manualPlantId: "plant-typed-by-grower",
      });
      expect(plan.step).toBe("hold-empty");
      expect(plan.holdActive).toBe(true);
      // The hold overrides any editor value — the blocked card shows no target.
      expect(plan.editorPlantId).toBe("");
    }
  });

  it("releases the hold once the grower dismisses that exact request", () => {
    const plan = resolveQuickLogTargetPlan({
      requestKey: "plant:ghost",
      prefillResolution: BLOCKED,
      dismissedBlockedPrefillKey: "plant:ghost",
      manualPlantId: "plant-2",
    });
    expect(plan.step).toBe("keep-current");
    expect(plan.holdActive).toBe(false);
    expect(plan.editorPlantId).toBe("plant-2");
  });

  it("does not release the hold when a DIFFERENT request was dismissed", () => {
    const plan = resolveQuickLogTargetPlan({
      requestKey: "plant:ghost-2",
      prefillResolution: BLOCKED,
      dismissedBlockedPrefillKey: "plant:ghost-1",
      manualPlantId: "plant-2",
    });
    expect(plan.step).toBe("hold-empty");
    expect(plan.holdActive).toBe(true);
  });

  it("starts unscoped launchers as manual selection, never a default", () => {
    const plan = resolveQuickLogTargetPlan({
      requestKey: null,
      prefillResolution: BLOCKED,
      dismissedBlockedPrefillKey: null,
      manualPlantId: "",
    });
    expect(plan).toEqual({
      step: "manual-selection",
      tier: "explicit-grower-selection",
      holdActive: false,
      editorPlantId: "",
    });
  });

  it("keeps a grower's own selection visible on an unscoped open", () => {
    const plan = resolveQuickLogTargetPlan({
      requestKey: null,
      prefillResolution: BLOCKED,
      dismissedBlockedPrefillKey: null,
      manualPlantId: "plant-chosen",
    });
    expect(plan.editorPlantId).toBe("plant-chosen");
  });
});

describe("resolveQuickLogTargetPlan — fail-closed matrix", () => {
  it("treats null/undefined/blank manual ids as no selection", () => {
    for (const manualPlantId of [null, undefined, "", "   "]) {
      const plan = resolveQuickLogTargetPlan({
        requestKey: null,
        prefillResolution: BLOCKED,
        dismissedBlockedPrefillKey: null,
        manualPlantId: manualPlantId as string,
      });
      expect(plan.editorPlantId).toBe("");
    }
  });

  it("never applies a ready resolution missing either id", () => {
    const missingGrow = resolveQuickLogTargetPlan({
      requestKey: "plant:plant-1",
      prefillResolution: {
        status: "ready",
        target: { plantId: "plant-1", growId: "", tentId: "tent-1" },
      },
      dismissedBlockedPrefillKey: null,
      manualPlantId: "",
    });
    expect(missingGrow.step).toBe("hold-empty");

    const missingPlant = resolveQuickLogTargetPlan({
      requestKey: "plant:plant-1",
      prefillResolution: {
        status: "ready",
        target: { plantId: "", growId: "grow-1", tentId: "tent-1" },
      },
      dismissedBlockedPrefillKey: null,
      manualPlantId: "",
    });
    expect(missingPlant.step).toBe("hold-empty");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      requestKey: "plant:plant-1",
      prefillResolution: READY,
      dismissedBlockedPrefillKey: null,
      manualPlantId: "",
    };
    expect(resolveQuickLogTargetPlan(input)).toEqual(resolveQuickLogTargetPlan(input));
  });

  it("performs no storage access — remembered targets cannot leak in", () => {
    // A pure module cannot read storage; assert the contract explicitly so a
    // future edit that reaches for localStorage fails here first.
    const source = resolveQuickLogTargetPlan.toString();
    expect(source).not.toMatch(/localStorage|sessionStorage|readLastTarget/);
  });
});

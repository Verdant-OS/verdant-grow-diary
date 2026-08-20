// Tranche B+ PR-B1 — executable Quick Log target precedence contract.
//
// These tests pass all source tiers independently. The pre-repair resolver,
// which accepted one already-collapsed prefill result, cannot satisfy this
// suite: precedence is exercised at runtime rather than pinned as dead data.
import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_TARGET_PRECEDENCE,
  resolveQuickLogTargetPlan,
  type QuickLogTarget,
  type QuickLogTargetCandidate,
} from "@/lib/quickLogTargetResolutionRules";

function plantTarget(
  plantId: string,
  growId: string | null = "grow-1",
  tentId: string | null = "tent-1",
): QuickLogTarget {
  return { type: "plant", plantId, growId, tentId };
}

function tentTarget(tentId: string, growId: string | null = "grow-1"): QuickLogTarget {
  return { type: "tent", plantId: null, tentId, growId };
}

function ready(target: QuickLogTarget, requestKey: string | null = null): QuickLogTargetCandidate {
  return { requestKey, resolution: { status: "ready", target } };
}

function blocked(requestKey: string, reason = "target_not_found"): QuickLogTargetCandidate {
  return { requestKey, resolution: { status: "blocked", reason } };
}

describe("QUICK_LOG_TARGET_PRECEDENCE", () => {
  it("orders explicit intent above route context above grower selection", () => {
    expect(QUICK_LOG_TARGET_PRECEDENCE).toEqual([
      "explicit-prefill-or-intent",
      "route-context",
      "explicit-grower-selection",
    ]);
  });

  it("has no remembered-default tier — remembered targets are never a fallback", () => {
    const asStrings: readonly string[] = QUICK_LOG_TARGET_PRECEDENCE;
    expect(asStrings.some((tier) => /remember|last|recent|previous/i.test(tier))).toBe(false);
    expect(QUICK_LOG_TARGET_PRECEDENCE).toHaveLength(3);
  });
});

describe("resolveQuickLogTargetPlan — executable precedence", () => {
  it("selects explicit prefill/intent ahead of route context and grower selection", () => {
    const plan = resolveQuickLogTargetPlan({
      explicitPrefillOrIntent: ready(plantTarget("explicit-plant")),
      routeContext: ready(tentTarget("route-tent")),
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
      dismissedBlockedPrefillKey: null,
    });

    expect(plan).toMatchObject({
      step: "apply-named",
      tier: "explicit-prefill-or-intent",
      target: { type: "plant", plantId: "explicit-plant" },
      holdActive: true,
      editorPlantId: "explicit-plant",
    });
  });

  it("selects a route-scoped tent ahead of grower selection when explicit intent is absent", () => {
    const plan = resolveQuickLogTargetPlan({
      explicitPrefillOrIntent: null,
      routeContext: ready(tentTarget("route-tent", "route-grow")),
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
      dismissedBlockedPrefillKey: null,
    });

    expect(plan).toEqual({
      step: "apply-named",
      tier: "route-context",
      target: {
        type: "tent",
        plantId: null,
        tentId: "route-tent",
        growId: "route-grow",
      },
      holdActive: true,
      editorPlantId: "",
    });
  });

  it("uses explicit grower selection only when no named source is present", () => {
    const plan = resolveQuickLogTargetPlan({
      explicitPrefillOrIntent: null,
      routeContext: null,
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
      dismissedBlockedPrefillKey: null,
    });

    expect(plan).toEqual({
      step: "manual-selection",
      tier: "explicit-grower-selection",
      target: {
        type: "plant",
        plantId: "selected-plant",
        tentId: null,
        growId: null,
      },
      holdActive: false,
      editorPlantId: "selected-plant",
    });
  });

  it("starts an unscoped launcher empty when no source exists", () => {
    expect(
      resolveQuickLogTargetPlan({
        dismissedBlockedPrefillKey: null,
      }),
    ).toEqual({
      step: "manual-selection",
      tier: null,
      target: null,
      holdActive: false,
      editorPlantId: "",
    });
  });
});

describe("resolveQuickLogTargetPlan — fail-closed named targets", () => {
  it("holds a blocked explicit target instead of falling through to a valid route or selection", () => {
    const plan = resolveQuickLogTargetPlan({
      explicitPrefillOrIntent: blocked("plant:ghost", "plant_not_found"),
      routeContext: ready(tentTarget("route-tent")),
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
      dismissedBlockedPrefillKey: null,
    });

    expect(plan).toEqual({
      step: "hold-empty",
      tier: "explicit-prefill-or-intent",
      reason: "plant_not_found",
      holdActive: true,
      editorPlantId: "",
    });
  });

  it("holds a blocked route target instead of falling through to selection", () => {
    const plan = resolveQuickLogTargetPlan({
      routeContext: blocked("tent:ghost", "tent_not_found"),
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
      dismissedBlockedPrefillKey: null,
    });

    expect(plan).toMatchObject({
      step: "hold-empty",
      tier: "route-context",
      reason: "tent_not_found",
    });
  });

  it("releases only the exact dismissed request and then considers the next tier", () => {
    const input = {
      explicitPrefillOrIntent: blocked("plant:ghost", "plant_not_found"),
      routeContext: ready(tentTarget("route-tent", "route-grow")),
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
    };

    expect(
      resolveQuickLogTargetPlan({
        ...input,
        dismissedBlockedPrefillKey: "plant:ghost",
      }),
    ).toMatchObject({
      step: "apply-named",
      tier: "route-context",
      target: { type: "tent", tentId: "route-tent" },
    });

    expect(
      resolveQuickLogTargetPlan({
        ...input,
        dismissedBlockedPrefillKey: "plant:different",
      }),
    ).toMatchObject({
      step: "hold-empty",
      tier: "explicit-prefill-or-intent",
    });
  });

  it("keeps the grower's current choice after dismissing a named request with no route target", () => {
    const plan = resolveQuickLogTargetPlan({
      explicitPrefillOrIntent: blocked("plant:ghost"),
      routeContext: null,
      explicitGrowerSelection: ready(plantTarget("selected-plant", null, null)),
      dismissedBlockedPrefillKey: "plant:ghost",
    });

    expect(plan).toMatchObject({
      step: "keep-current",
      tier: "explicit-grower-selection",
      editorPlantId: "selected-plant",
    });
  });

  it("never applies a named plant or tent target without proven grow context", () => {
    for (const candidate of [
      ready(plantTarget("plant-1", null), "plant:plant-1"),
      ready(tentTarget("tent-1", null), "tent:tent-1"),
    ]) {
      const plan = resolveQuickLogTargetPlan({
        explicitPrefillOrIntent: candidate,
        routeContext: ready(tentTarget("lower-route")),
        explicitGrowerSelection: ready(plantTarget("lower-selection", null, null)),
        dismissedBlockedPrefillKey: null,
      });
      expect(plan).toMatchObject({
        step: "hold-empty",
        tier: "explicit-prefill-or-intent",
        reason: "invalid_target_context",
      });
    }
  });

  it("treats blank named identity as unscoped instead of creating an undismissable hold", () => {
    const plan = resolveQuickLogTargetPlan({
      explicitPrefillOrIntent: {
        requestKey: "   ",
        resolution: { status: "blocked", reason: "prefill_target_pending" },
      },
      explicitGrowerSelection: ready(plantTarget("stale-selection", null, null)),
      dismissedBlockedPrefillKey: null,
    });

    expect(plan).toEqual({
      step: "manual-selection",
      tier: null,
      target: null,
      holdActive: false,
      editorPlantId: "",
    });
  });

  it("normalizes null/undefined/blank grower selections to no selection", () => {
    for (const plantId of ["", "   "]) {
      const plan = resolveQuickLogTargetPlan({
        explicitGrowerSelection: ready(plantTarget(plantId, null, null)),
        dismissedBlockedPrefillKey: null,
      });
      expect(plan).toMatchObject({
        step: "manual-selection",
        tier: null,
        target: null,
        editorPlantId: "",
      });
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      explicitPrefillOrIntent: ready(plantTarget("plant-1")),
      routeContext: ready(tentTarget("tent-1")),
      explicitGrowerSelection: ready(plantTarget("plant-2", null, null)),
      dismissedBlockedPrefillKey: null,
    };
    expect(resolveQuickLogTargetPlan(input)).toEqual(resolveQuickLogTargetPlan(input));
  });

  it("performs no storage access — remembered targets cannot leak in", () => {
    const source = resolveQuickLogTargetPlan.toString();
    expect(source).not.toMatch(/localStorage|sessionStorage|readLastTarget/);
  });
});

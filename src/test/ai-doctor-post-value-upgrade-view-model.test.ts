import { describe, expect, it } from "vitest";

import {
  AI_DOCTOR_POST_VALUE_UPGRADE_SURFACE,
  buildAiDoctorPostValueUpgradeViewModel,
} from "@/lib/aiDoctorPostValueUpgradeViewModel";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";
import { paywallCtaHasBannedWords, paywallCtaViewModelText } from "@/lib/paywallCtaViewModel";

const NOW = new Date("2026-07-20T00:00:00.000Z");
const FREE = resolveEntitlements(null, NOW);

function entitlement(overrides: Partial<ResolvedEntitlement> = {}): ResolvedEntitlement {
  return { ...FREE, ...overrides };
}

const FINAL_FREE_CREDIT = {
  plan_id: "free",
  remaining: 0,
  scope: "per_grow",
  scope_limit: 3,
} as const;

describe("buildAiDoctorPostValueUpgradeViewModel", () => {
  it("shows a calm return-safe handoff only after the final Free review is saved", () => {
    const vm = buildAiDoctorPostValueUpgradeViewModel({
      credit: FINAL_FREE_CREDIT,
      viewerEntitlement: FREE,
      entitlementLoading: false,
      durableSessionSaved: true,
      returnTo: "/plants/plant-1?tentId=tent-1#plant-ai-doctor-review",
    });

    expect(vm.visible).toBe(true);
    if (!vm.visible) throw new Error("expected visible post-value handoff");
    expect(vm.paywallVm.primaryCtaHref).toBe(
      "/pricing?returnTo=%2Fplants%2Fplant-1%3FtentId%3Dtent-1%23plant-ai-doctor-review",
    );
    expect(vm.paywallVm.description).toContain("3 included AI credits");
    expect(vm.paywallVm.description).toContain("100 AI credits per month");
    expect(vm.paywallVm.secondaryCopy).toContain("saved in AI Doctor history");
    expect(paywallCtaHasBannedWords(paywallCtaViewModelText(vm.paywallVm))).toBe(false);
    expect(AI_DOCTOR_POST_VALUE_UPGRADE_SURFACE).toBe("ai_doctor_post_value");
  });

  it.each([
    ["one credit remains", { ...FINAL_FREE_CREDIT, remaining: 1 }],
    ["two credits remain", { ...FINAL_FREE_CREDIT, remaining: 2 }],
    ["monthly scope", { ...FINAL_FREE_CREDIT, scope: "per_month" }],
    ["unexpected limit", { ...FINAL_FREE_CREDIT, scope_limit: 4 }],
    ["missing server plan", { remaining: 0, scope: "per_grow", scope_limit: 3 }],
    ["unknown server plan", { ...FINAL_FREE_CREDIT, plan_id: "unknown" }],
    ["paid server plan", { ...FINAL_FREE_CREDIT, plan_id: "pro_monthly" }],
    ["replay-only response", { plan_id: "free", replayed: true }],
  ])("hides for %s", (_label, credit) => {
    expect(
      buildAiDoctorPostValueUpgradeViewModel({
        credit,
        viewerEntitlement: FREE,
        entitlementLoading: false,
        durableSessionSaved: true,
      }),
    ).toEqual({ visible: false });
  });

  it("hides before durable save, while entitlement is loading, or when viewer is unknown", () => {
    const base = {
      credit: FINAL_FREE_CREDIT,
      viewerEntitlement: FREE,
      entitlementLoading: false,
      durableSessionSaved: true,
    } as const;

    expect(buildAiDoctorPostValueUpgradeViewModel({ ...base, durableSessionSaved: false })).toEqual(
      { visible: false },
    );
    expect(buildAiDoctorPostValueUpgradeViewModel({ ...base, entitlementLoading: true })).toEqual({
      visible: false,
    });
    expect(buildAiDoctorPostValueUpgradeViewModel({ ...base, viewerEntitlement: null })).toEqual({
      visible: false,
    });
    for (const viewerEntitlement of [
      entitlement({
        status: "unknown",
        degraded: true,
        degradedReason: "unknown_plan_id",
      }),
      entitlement({
        status: "unknown",
        degraded: true,
        degradedReason: "unknown_status",
      }),
    ]) {
      expect(buildAiDoctorPostValueUpgradeViewModel({ ...base, viewerEntitlement })).toEqual({
        visible: false,
      });
    }
  });

  it("defensively hides for active Pro and Founder viewers, including degraded Founder identity", () => {
    const viewers: ResolvedEntitlement[] = [
      entitlement({
        effectivePlanId: "pro_monthly",
        displayPlanId: "pro_monthly",
        isActive: true,
        status: "active",
      }),
      entitlement({
        effectivePlanId: "founder_lifetime",
        displayPlanId: "founder_lifetime",
        isActive: true,
        status: "active",
      }),
      entitlement({
        effectivePlanId: "free",
        displayPlanId: "founder_lifetime",
        degraded: true,
        degradedReason: "expired",
        status: "expired",
      }),
    ];

    for (const viewerEntitlement of viewers) {
      expect(
        buildAiDoctorPostValueUpgradeViewModel({
          credit: FINAL_FREE_CREDIT,
          viewerEntitlement,
          entitlementLoading: false,
          durableSessionSaved: true,
        }),
      ).toEqual({ visible: false });
    }
  });

  it("allows a lapsed recurring Pro viewer to reactivate when the server resolves Free", () => {
    const vm = buildAiDoctorPostValueUpgradeViewModel({
      credit: FINAL_FREE_CREDIT,
      viewerEntitlement: entitlement({
        effectivePlanId: "free",
        displayPlanId: "pro_monthly",
        degraded: true,
        degradedReason: "expired",
        status: "expired",
      }),
      entitlementLoading: false,
      durableSessionSaved: true,
    });
    expect(vm.visible).toBe(true);
  });

  it.each(["https://evil.example/phish", "//evil.example", "/\\evil", "javascript:x"])(
    "falls back to plain pricing for unsafe return target %s",
    (returnTo) => {
      const vm = buildAiDoctorPostValueUpgradeViewModel({
        credit: FINAL_FREE_CREDIT,
        viewerEntitlement: FREE,
        entitlementLoading: false,
        durableSessionSaved: true,
        returnTo,
      });
      expect(vm.visible).toBe(true);
      if (!vm.visible) throw new Error("expected visible post-value handoff");
      expect(vm.paywallVm.primaryCtaHref).toBe("/pricing");
    },
  );

  it("is deterministic and contains no urgency or certainty language", () => {
    const input = {
      credit: FINAL_FREE_CREDIT,
      viewerEntitlement: FREE,
      entitlementLoading: false,
      durableSessionSaved: true,
      returnTo: "/plants/plant-1#plant-ai-doctor-review",
    } as const;
    const first = buildAiDoctorPostValueUpgradeViewModel(input);
    const second = buildAiDoctorPostValueUpgradeViewModel(input);
    expect(first).toEqual(second);
    if (!first.visible) throw new Error("expected visible post-value handoff");
    const text = paywallCtaViewModelText(first.paywallVm).toLowerCase();
    for (const banned of ["guarantee", "certain", "act now", "hurry", "last chance"]) {
      expect(text).not.toContain(banned);
    }
  });
});

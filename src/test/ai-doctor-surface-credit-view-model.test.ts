import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_FREE_PLAN_CREDIT_COPY,
  buildAiDoctorSurfaceCreditViewModel,
} from "@/lib/aiDoctorSurfaceCreditViewModel";
import type { ResolvedEntitlement } from "@/lib/entitlements/types";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const freeEntitlement = (): ResolvedEntitlement => ({
  displayPlanId: "free",
  effectivePlanId: "free",
  status: "active",
  isActive: true,
  capabilities: { ...FREE_CAPABILITIES, aiCreditsPerGrow: 3 },
  degraded: false,
  degradedReason: "null_row_free",
  isStaff: false,
  source: "free",
});

describe("buildAiDoctorSurfaceCreditViewModel (#2161)", () => {
  it("derives per-grow remaining from allowanceUsed when no post-spend receipt exists", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlement: freeEntitlement(),
      allowanceUsed: 2,
    });
    expect(vm.creditRemaining).toEqual({
      remaining: 1,
      scope: "per_grow",
      scope_limit: 3,
    });
    expect(vm.freePlanCreditCopy).toBe(AI_DOCTOR_FREE_PLAN_CREDIT_COPY);
  });

  it("shows Free copy but hides the badge when allowanceUsed read failed", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlement: freeEntitlement(),
      allowanceReadFailed: true,
    });
    expect(vm.creditRemaining).toBeNull();
    expect(vm.freePlanCreditCopy).toBe(AI_DOCTOR_FREE_PLAN_CREDIT_COPY);
  });

  it("falls back to post-spend credit only when entitlement lookup failed", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlementLookupFailed: true,
      allowanceUsed: 99,
      postSpendCredit: { remaining: 2, scope: "per_grow", scope_limit: 3 },
    });
    expect(vm.creditRemaining).toEqual({
      remaining: 2,
      scope: "per_grow",
      scope_limit: 3,
    });
    expect(vm.freePlanCreditCopy).toBeNull();
  });

  it("maps a free-plan credit_denied envelope to a zero-balance badge", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlement: freeEntitlement(),
      deniedCredit: {
        scope: "per_grow",
        scope_limit: 3,
        remaining: 0,
        plan_id: "free",
      },
    });
    expect(vm.creditRemaining).toEqual({
      remaining: 0,
      scope: "per_grow",
      scope_limit: 3,
    });
    expect(vm.freePlanCreditCopy).toBe(AI_DOCTOR_FREE_PLAN_CREDIT_COPY);
  });

  it("uses monthly denial envelope for paid viewers that bypass upsell", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlement: {
        ...freeEntitlement(),
        displayPlanId: "pro_monthly",
        effectivePlanId: "pro_monthly",
        capabilities: { ...FREE_CAPABILITIES, aiCreditsPerGrow: null, aiMonthlyCredits: 100 },
        source: "lovable_paddle_subscription",
      },
      deniedCredit: {
        scope: "per_month",
        scope_limit: 100,
        remaining: 0,
        plan_id: "pro_monthly",
      },
    });
    expect(vm.creditRemaining).toEqual({
      remaining: 0,
      scope: "per_month",
      scope_limit: 100,
    });
    expect(vm.freePlanCreditCopy).toBeNull();
  });

  it("does not show Free copy for degraded unknown-plan entitlements", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlement: {
        ...freeEntitlement(),
        status: "unknown",
        degraded: true,
        degradedReason: "unknown_plan_id",
      },
      allowanceUsed: 0,
    });
    expect(vm.freePlanCreditCopy).toBeNull();
    expect(vm.creditRemaining).toBeNull();
  });

  it("uses a custom per-grow cap in copy when capabilities diverge from the default", () => {
    const vm = buildAiDoctorSurfaceCreditViewModel({
      entitlement: {
        ...freeEntitlement(),
        capabilities: { ...FREE_CAPABILITIES, aiCreditsPerGrow: 5 },
      },
      allowanceUsed: 1,
    });
    expect(vm.freePlanCreditCopy).toBe("Free plan includes 5 AI Doctor credits per grow.");
    expect(vm.creditRemaining?.scope_limit).toBe(5);
  });
});

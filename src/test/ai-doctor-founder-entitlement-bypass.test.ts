/**
 * AI Doctor founder/admin entitlement bypass — pure-helper tests.
 *
 * Asserts:
 *  - Founder bypasses upsell prompts even when the server denial
 *    mis-tags plan_id="free".
 *  - Paid (pro_monthly / pro_annual) viewers bypass upsell prompts.
 *  - Regular free viewers STILL see the upsell prompt.
 *  - Unknown / missing viewer entitlement does NOT trigger bypass
 *    (no leak of founder access to free users).
 *  - The helper never grants credits, never mutates anything, and
 *    never silences a non-free denial (paid → still "wait").
 *  - Entitlement gating logic is centralized in
 *    `src/lib/aiDoctorEntitlementRules.ts` — components do not branch
 *    on plan_id in JSX.
 *  - No raw user IDs, secrets, JWTs, or PII leak into the reason
 *    strings.
 */
import { describe, it, expect } from "vitest";
import {
  reconcileAiCreditDenialPlanId,
  resolveAiDoctorEntitlementView,
} from "@/lib/aiDoctorEntitlementRules";
import {
  buildAiCreditLimitNoticeViewModel,
  type AiCreditDenial,
} from "@/lib/aiCreditLimitNoticeViewModel";
import { resolveEntitlements } from "@/lib/entitlements";
import type {
  BillingSubscriptionRow,
  PlanId,
  ResolvedEntitlement,
} from "@/lib/entitlements/types";

const at = new Date("2026-06-19T00:00:00Z");

function rowFor(plan: PlanId): BillingSubscriptionRow {
  return {
    id: "sub_test",
    user_id: "user_test",
    plan_id: plan,
    status: "active",
    provider: "stripe",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: "2099-01-01T00:00:00Z",
    cancel_at_period_end: false,
    founder_number: plan === "founder_lifetime" ? 1 : null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}

function denial(planId: string | null): AiCreditDenial {
  return {
    ok: false,
    status: "denied",
    reason: "limit_reached",
    scope: planId === "free" ? "per_grow" : "per_month",
    scope_used: 3,
    scope_limit: 3,
    remaining: 0,
    plan_id: planId,
  };
}

const founderEnt: ResolvedEntitlement = resolveEntitlements(
  rowFor("founder_lifetime"),
  at,
);
const proEnt: ResolvedEntitlement = resolveEntitlements(
  rowFor("pro_monthly"),
  at,
);
const freeEnt: ResolvedEntitlement = resolveEntitlements(null, at);

describe("resolveAiDoctorEntitlementView", () => {
  it("founder_lifetime → bypasses upsell with founder_bypass reason", () => {
    const v = resolveAiDoctorEntitlementView({ entitlement: founderEnt });
    expect(v.isFounder).toBe(true);
    expect(v.isPaidViewer).toBe(true);
    expect(v.bypassesUpsell).toBe(true);
    expect(v.reason).toBe("founder_bypass");
  });

  it.each(["pro_monthly", "pro_annual"] as const)(
    "%s → bypasses upsell with paid_plan_bypass reason",
    (plan) => {
      const v = resolveAiDoctorEntitlementView({
        entitlement: resolveEntitlements(rowFor(plan), at),
      });
      expect(v.isFounder).toBe(false);
      expect(v.isPaidViewer).toBe(true);
      expect(v.bypassesUpsell).toBe(true);
      expect(v.reason).toBe("paid_plan_bypass");
    },
  );

  it("free → does NOT bypass upsell", () => {
    const v = resolveAiDoctorEntitlementView({ entitlement: freeEnt });
    expect(v.bypassesUpsell).toBe(false);
    expect(v.reason).toBe("free_or_unknown_viewer");
  });

  it.each([null, undefined])(
    "missing entitlement (%p) → no bypass (fail-closed)",
    (ent) => {
      const v = resolveAiDoctorEntitlementView({ entitlement: ent });
      expect(v.bypassesUpsell).toBe(false);
      expect(v.isFounder).toBe(false);
    },
  );

  it("reasons contain NO raw user IDs, emails, JWTs, or secrets", () => {
    for (const ent of [founderEnt, proEnt, freeEnt, null]) {
      const v = resolveAiDoctorEntitlementView({ entitlement: ent });
      expect(v.reason).not.toMatch(/user_|@|eyJ|sk_|service_role|jwt/i);
    }
  });
});

describe("reconcileAiCreditDenialPlanId", () => {
  it("founder + denial.plan_id='free' → reclassified to founder_lifetime", () => {
    const view = resolveAiDoctorEntitlementView({ entitlement: founderEnt });
    expect(
      reconcileAiCreditDenialPlanId({ denialPlanId: "free", view }),
    ).toBe("founder_lifetime");
  });

  it("pro + denial.plan_id='free' → reclassified to pro_monthly", () => {
    const view = resolveAiDoctorEntitlementView({ entitlement: proEnt });
    expect(
      reconcileAiCreditDenialPlanId({ denialPlanId: "free", view }),
    ).toBe("pro_monthly");
  });

  it("free viewer + denial.plan_id='free' → unchanged (upsell still shown)", () => {
    const view = resolveAiDoctorEntitlementView({ entitlement: freeEnt });
    expect(
      reconcileAiCreditDenialPlanId({ denialPlanId: "free", view }),
    ).toBe("free");
  });

  it("non-free denial is never rewritten", () => {
    const view = resolveAiDoctorEntitlementView({ entitlement: founderEnt });
    for (const p of ["pro_monthly", "pro_annual", "founder_lifetime", null]) {
      expect(reconcileAiCreditDenialPlanId({ denialPlanId: p, view })).toBe(p);
    }
  });
});

describe("AiCreditLimitNoticeViewModel — founder bypass integration", () => {
  it("founder viewer + free-tagged denial → 'wait', NO paywall", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
      viewerEntitlement: founderEnt,
    });
    expect(vm.kind).toBe("wait");
    expect(vm.paywallVm).toBeUndefined();
    expect(vm.charged).toBe(false);
    expect(vm.title.toLowerCase()).not.toContain("pro");
    expect(vm.body.toLowerCase()).not.toContain("upgrade");
  });

  it("pro viewer + free-tagged denial → 'wait', NO paywall", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
      viewerEntitlement: proEnt,
    });
    expect(vm.kind).toBe("wait");
    expect(vm.paywallVm).toBeUndefined();
  });

  it("free viewer + free denial → still 'upsell' (regression guard)", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
      viewerEntitlement: freeEnt,
    });
    expect(vm.kind).toBe("upsell");
    expect(vm.paywallVm).toBeDefined();
  });

  it("free viewer with NO viewerEntitlement passed → unchanged 'upsell'", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
    });
    expect(vm.kind).toBe("upsell");
    expect(vm.paywallVm).toBeDefined();
  });

  it("founder + paid denial → 'wait' (founder bypass does not silence wait)", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("founder_lifetime"),
      viewerEntitlement: founderEnt,
    });
    expect(vm.kind).toBe("wait");
  });

  it("unknown-plan denial is unchanged regardless of viewer", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial(null),
      viewerEntitlement: founderEnt,
    });
    expect(vm.kind).toBe("unknown");
  });

  it("AI Coach surface gets the same founder bypass", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
      viewerEntitlement: founderEnt,
      surface: "coach",
    });
    expect(vm.kind).toBe("wait");
    expect(vm.paywallVm).toBeUndefined();
  });

  it("notice body never leaks user_id / token / secret strings", () => {
    const vm = buildAiCreditLimitNoticeViewModel({
      credit: denial("free"),
      viewerEntitlement: founderEnt,
    });
    const combined = `${vm.title} ${vm.body}`;
    expect(combined).not.toMatch(/eyJ|sk_|service_role|user_test|bearer/i);
  });
});

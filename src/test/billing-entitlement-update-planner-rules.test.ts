import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planBillingEntitlementUpdate } from "@/lib/billingEntitlementUpdatePlannerRules";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/lib/billingEntitlementUpdatePlannerRules.ts"),
  "utf8",
);

const baseProcessing = {
  status: "processed",
  candidate_plan_id: "pro_monthly",
  candidate_status: "active",
  provider_customer_id: "ctm_123",
  provider_subscription_id: "sub_123",
  current_period_end: "2026-07-21T00:00:00.000Z",
  cancel_at_period_end: false,
  is_founder_candidate: false,
};

const baseLink = {
  user_id: "user_123",
  provider: "paddle",
  provider_customer_id: "ctm_123",
  provider_subscription_id: "sub_123",
  link_status: "linked",
  confidence: "verified",
};

describe("planBillingEntitlementUpdate", () => {
  it("plans a Pro Monthly entitlement payload from a processed row and verified link", () => {
    const result = planBillingEntitlementUpdate(baseProcessing, baseLink);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.conflictTarget).toBe("user_id");
    expect(result.payload).toEqual({
      user_id: "user_123",
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      provider_customer_id: "ctm_123",
      provider_subscription_id: "sub_123",
      current_period_end: "2026-07-21T00:00:00.000Z",
      cancel_at_period_end: false,
      founder_number: null,
    });
  });

  it("plans Pro Annual, past_due, canceled, paused, and expired statuses", () => {
    for (const status of ["past_due", "canceled", "paused", "expired"] as const) {
      const result = planBillingEntitlementUpdate(
        { ...baseProcessing, candidate_plan_id: "pro_annual", candidate_status: status, cancel_at_period_end: true },
        baseLink,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      expect(result.payload.plan_id).toBe("pro_annual");
      expect(result.payload.status).toBe(status);
      expect(result.payload.cancel_at_period_end).toBe(true);
    }
  });

  it("blocks missing inputs", () => {
    expect(planBillingEntitlementUpdate(null, baseLink)).toEqual({ ok: false, reason: "missing_processing_row" });
    expect(planBillingEntitlementUpdate(baseProcessing, null)).toEqual({ ok: false, reason: "missing_link_row" });
  });

  it("blocks failed, blocked, or ignored processing rows", () => {
    for (const status of ["failed", "blocked", "ignored"] as const) {
      expect(planBillingEntitlementUpdate({ ...baseProcessing, status }, baseLink)).toEqual({
        ok: false,
        reason: "processing_not_processed",
      });
    }
  });

  it("blocks unknown and Founder plans", () => {
    expect(planBillingEntitlementUpdate({ ...baseProcessing, candidate_plan_id: "free" }, baseLink)).toEqual({
      ok: false,
      reason: "unknown_plan",
    });
    expect(planBillingEntitlementUpdate({ ...baseProcessing, candidate_plan_id: "founder_lifetime" }, baseLink)).toEqual({
      ok: false,
      reason: "founder_allocation_deferred",
    });
    expect(planBillingEntitlementUpdate({ ...baseProcessing, is_founder_candidate: true }, baseLink)).toEqual({
      ok: false,
      reason: "founder_allocation_deferred",
    });
  });

  it("blocks unknown candidate status", () => {
    expect(planBillingEntitlementUpdate({ ...baseProcessing, candidate_status: "trialing" }, baseLink)).toEqual({
      ok: false,
      reason: "unknown_candidate_status",
    });
  });

  it("blocks missing processing provider identifiers", () => {
    expect(planBillingEntitlementUpdate({ ...baseProcessing, provider_customer_id: null }, baseLink)).toEqual({
      ok: false,
      reason: "missing_provider_customer_id",
    });
    expect(planBillingEntitlementUpdate({ ...baseProcessing, provider_subscription_id: null }, baseLink)).toEqual({
      ok: false,
      reason: "missing_provider_subscription_id",
    });
  });

  it("blocks unsafe link state", () => {
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, link_status: "pending_review" })).toEqual({
      ok: false,
      reason: "link_not_linked",
    });
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, confidence: "review_required" })).toEqual({
      ok: false,
      reason: "link_not_verified",
    });
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, provider: "stripe" })).toEqual({
      ok: false,
      reason: "link_provider_not_paddle",
    });
  });

  it("blocks missing or mismatched link identifiers", () => {
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, user_id: "" })).toEqual({
      ok: false,
      reason: "missing_link_user_id",
    });
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, provider_customer_id: null })).toEqual({
      ok: false,
      reason: "missing_link_provider_customer_id",
    });
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, provider_customer_id: "ctm_other" })).toEqual({
      ok: false,
      reason: "provider_customer_mismatch",
    });
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, provider_subscription_id: null })).toEqual({
      ok: false,
      reason: "missing_link_provider_subscription_id",
    });
    expect(planBillingEntitlementUpdate(baseProcessing, { ...baseLink, provider_subscription_id: "sub_other" })).toEqual({
      ok: false,
      reason: "provider_subscription_mismatch",
    });
  });

  it("trims safe strings and treats missing period end as null", () => {
    const result = planBillingEntitlementUpdate(
      { ...baseProcessing, provider_customer_id: " ctm_123 ", provider_subscription_id: " sub_123 ", current_period_end: " " },
      { ...baseLink, user_id: " user_123 ", provider_customer_id: "ctm_123", provider_subscription_id: "sub_123" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.user_id).toBe("user_123");
    expect(result.payload.provider_customer_id).toBe("ctm_123");
    expect(result.payload.provider_subscription_id).toBe("sub_123");
    expect(result.payload.current_period_end).toBeNull();
  });

  it("is pure planning logic with no database, network, storage, or runtime wiring", () => {
    expect(SOURCE).not.toMatch(/supabase/i);
    expect(SOURCE).not.toMatch(/fetch\(/);
    expect(SOURCE).not.toMatch(/localStorage|sessionStorage/);
    expect(SOURCE).not.toMatch(/\.from\(/);
    expect(SOURCE).not.toMatch(/\.insert\(/);
    expect(SOURCE).not.toMatch(/\.update\(/);
    expect(SOURCE).not.toMatch(/\.delete\(/);
    expect(SOURCE).not.toMatch(/\.upsert\(/);
    expect(SOURCE).not.toMatch(/functions\.invoke/);
    expect(SOURCE).not.toMatch(/service_role/i);
  });
});

import { describe, expect, it } from "vitest";
import {
  parseBillingEntitlementResolutionAuditResponse,
  BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS,
  BILLING_ENTITLEMENT_RESOLUTION_AUDIT_OPERATOR_ROW_KEYS,
  formatBillingEntitlementResolutionAiCreditsPerMonth,
  formatBillingEntitlementResolutionState,
} from "@/lib/billingEntitlementResolutionAuditViewModel";

const FORBIDDEN_VALUE = "FORBIDDEN_LEAK";

function makeRow(extra: Record<string, unknown> = {}) {
  return {
    plan_id: "pro_monthly",
    subscription_status: "active",
    effective_entitlement_state: "active",
    fallback_reason: null,
    cancel_at_period_end: false,
    current_period_end_present: true,
    updated_at: "2026-06-22T12:00:00Z",
    ...extra,
  };
}

describe("parseBillingEntitlementResolutionAuditResponse — happy path", () => {
  it("maps active row with sanitized labels", () => {
    const vm = parseBillingEntitlementResolutionAuditResponse({
      ok: true,
      generated_at: "2026-06-22T12:00:00Z",
      limit: 50,
      counts: {
        total: 5,
        active: 3,
        free_fallback: 1,
        expired_fallback: 1,
        blocked: 0,
        unknown: 0,
      },
      latest: [makeRow()],
    });
    expect(vm.ok).toBe(true);
    expect(vm.counts.total).toBe(5);
    expect(vm.latest).toHaveLength(1);
    const row = vm.latest[0];
    expect(row.planLabel).toBe("Pro Monthly");
    expect(row.subscriptionStatusLabel).toBe("Active");
    expect(row.entitlementStateLabel).toBe("Active");
    expect(row.fallbackReasonLabel).toBe("No fallback");
    expect(row.aiCreditsPerMonthLabel).toBe("100 / month");
    expect(row.updatedAtLabel).toBe("2026-06-22T12:00:00Z");
  });

  it("maps free_fallback, expired_fallback, blocked, unknown states", () => {
    const vm = parseBillingEntitlementResolutionAuditResponse({
      ok: true,
      counts: {},
      latest: [
        makeRow({
          plan_id: "free",
          subscription_status: null,
          effective_entitlement_state: "free_fallback",
          fallback_reason: null,
        }),
        makeRow({
          plan_id: "pro_annual",
          subscription_status: "expired",
          effective_entitlement_state: "expired_fallback",
          fallback_reason: "expired",
        }),
        makeRow({
          plan_id: "pro_monthly",
          subscription_status: "past_due",
          effective_entitlement_state: "blocked",
          fallback_reason: "past_due",
        }),
        makeRow({
          plan_id: null,
          subscription_status: null,
          effective_entitlement_state: "unknown",
          fallback_reason: "unknown_plan_id",
        }),
      ],
    });
    expect(vm.latest.map((r) => r.entitlementState)).toEqual([
      "free_fallback",
      "expired_fallback",
      "blocked",
      "unknown",
    ]);
    expect(vm.latest[1].fallbackReasonLabel).toBe("Subscription expired");
    expect(vm.latest[2].fallbackReasonLabel).toBe("Subscription past due");
    expect(vm.latest[3].fallbackReasonLabel).toBe("Unknown plan id");
    expect(vm.latest[3].planLabel).toBe("—");
    expect(vm.latest[3].aiCreditsPerMonthLabel).toBe("—");
  });
});

describe("parseBillingEntitlementResolutionAuditResponse — safety", () => {
  it("returns a safe ok=false on a non-object input", () => {
    const vm = parseBillingEntitlementResolutionAuditResponse(null);
    expect(vm.ok).toBe(false);
    expect(vm.latest).toEqual([]);
    expect(vm.counts.total).toBe(0);
  });

  it("falls back to safe defaults on unknown/garbage row fields", () => {
    const vm = parseBillingEntitlementResolutionAuditResponse({
      ok: true,
      latest: [
        {
          plan_id: "bogus",
          subscription_status: "weird",
          effective_entitlement_state: "lol",
          fallback_reason: "garbage",
          cancel_at_period_end: "yes",
          current_period_end_present: 1,
          updated_at: "   ",
        },
      ],
    });
    const row = vm.latest[0];
    expect(row.planId).toBeNull();
    expect(row.subscriptionStatus).toBeNull();
    expect(row.entitlementState).toBe("unknown");
    expect(row.fallbackReason).toBeNull();
    expect(row.cancelAtPeriodEnd).toBe(false);
    expect(row.currentPeriodEndPresent).toBe(false);
    expect(row.updatedAtLabel).toBe("—");
  });

  it("never surfaces forbidden raw provider/payload fields, even if injected", () => {
    const dirty: Record<string, unknown> = makeRow();
    for (const key of BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS) {
      dirty[key] = FORBIDDEN_VALUE;
    }
    const vm = parseBillingEntitlementResolutionAuditResponse({
      ok: true,
      latest: [dirty],
    });
    const serialized = JSON.stringify(vm);
    expect(serialized).not.toContain(FORBIDDEN_VALUE);
    for (const key of BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });

  it("operator row key list does not include any forbidden keys", () => {
    for (const forbidden of BILLING_ENTITLEMENT_RESOLUTION_AUDIT_FORBIDDEN_KEYS) {
      expect(
        BILLING_ENTITLEMENT_RESOLUTION_AUDIT_OPERATOR_ROW_KEYS as readonly string[],
      ).not.toContain(forbidden);
    }
  });

  it("labels operator_required reason safely", () => {
    const vm = parseBillingEntitlementResolutionAuditResponse({
      ok: false,
      reason: "operator_required",
    });
    expect(vm.ok).toBe(false);
    expect(vm.reasonLabel).toBe("Operator role required.");
  });
});

describe("entitlement resolution label helpers", () => {
  it("ai credits per month: free=0, pro/founder=100", () => {
    expect(formatBillingEntitlementResolutionAiCreditsPerMonth("free")).toBe(
      "0 / month",
    );
    expect(
      formatBillingEntitlementResolutionAiCreditsPerMonth("pro_monthly"),
    ).toBe("100 / month");
    expect(
      formatBillingEntitlementResolutionAiCreditsPerMonth("pro_annual"),
    ).toBe("100 / month");
    expect(
      formatBillingEntitlementResolutionAiCreditsPerMonth("founder_lifetime"),
    ).toBe("100 / month");
    expect(formatBillingEntitlementResolutionAiCreditsPerMonth(null)).toBe("—");
  });

  it("state labels are stable", () => {
    expect(formatBillingEntitlementResolutionState("active")).toBe("Active");
    expect(formatBillingEntitlementResolutionState("free_fallback")).toBe(
      "Free fallback",
    );
    expect(formatBillingEntitlementResolutionState("expired_fallback")).toBe(
      "Expired fallback",
    );
    expect(formatBillingEntitlementResolutionState("blocked")).toBe("Blocked");
    expect(formatBillingEntitlementResolutionState("unknown")).toBe("Unknown");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatBillingCustomerLinkConfidence,
  formatBillingCustomerLinkSource,
  formatBillingCustomerLinkStatus,
  parseBillingCustomerLinkAuditResponse,
} from "@/lib/billingCustomerLinkAuditViewModel";

describe("billing customer link audit view model", () => {
  it("parses a successful sanitized operator audit response", () => {
    const vm = parseBillingCustomerLinkAuditResponse({
      ok: true,
      generated_at: "2026-06-21T01:15:00.000Z",
      limit: 50,
      counts: {
        total: 4,
        linked: 2,
        pending_review: 1,
        blocked: 1,
        inactive: 0,
        verified: 2,
        review_required: 1,
        blocked_confidence: 1,
      },
      latest: [
        {
          created_at: "2026-06-21T01:14:00.000Z",
          updated_at: "2026-06-21T01:14:30.000Z",
          provider: "paddle",
          link_status: "linked",
          link_source: "webhook",
          confidence: "verified",
          has_customer_id: true,
          has_subscription_id: true,
          has_checkout_id: false,
          has_event_reference: true,
        },
      ],
    });

    expect(vm.ok).toBe(true);
    expect(vm.generatedAt).toBe("2026-06-21T01:15:00.000Z");
    expect(vm.counts).toEqual({
      total: 4,
      linked: 2,
      pendingReview: 1,
      blocked: 1,
      inactive: 0,
      verified: 2,
      reviewRequired: 1,
      blockedConfidence: 1,
    });
    expect(vm.latest).toHaveLength(1);
    expect(vm.latest[0]).toMatchObject({
      provider: "paddle",
      linkStatus: "linked",
      linkStatusLabel: "Linked",
      linkSource: "webhook",
      linkSourceLabel: "Webhook",
      confidence: "verified",
      confidenceLabel: "Verified",
      hasCustomerId: true,
      hasSubscriptionId: true,
      hasCheckoutId: false,
      hasEventReference: true,
    });
  });

  it("does not echo unknown raw provider or status values", () => {
    const vm = parseBillingCustomerLinkAuditResponse({
      ok: true,
      counts: { total: 1 },
      latest: [
        {
          provider: "unexpected_provider_value",
          link_status: "unexpected_status_value",
          link_source: "unexpected_source_value",
          confidence: "unexpected_confidence_value",
        },
      ],
    });

    expect(vm.latest[0]).toMatchObject({
      provider: "unknown_provider",
      linkStatus: "blocked",
      linkStatusLabel: "Blocked",
      linkSource: "unknown",
      linkSourceLabel: "Unknown",
      confidence: "blocked",
      confidenceLabel: "Blocked",
    });
    expect(JSON.stringify(vm)).not.toContain("unexpected_provider_value");
    expect(JSON.stringify(vm)).not.toContain("unexpected_status_value");
    expect(JSON.stringify(vm)).not.toContain("unexpected_source_value");
    expect(JSON.stringify(vm)).not.toContain("unexpected_confidence_value");
  });

  it("formats safe labels", () => {
    expect(formatBillingCustomerLinkStatus("linked")).toBe("Linked");
    expect(formatBillingCustomerLinkStatus("pending_review")).toBe("Pending review");
    expect(formatBillingCustomerLinkStatus("blocked")).toBe("Blocked");
    expect(formatBillingCustomerLinkStatus("inactive")).toBe("Inactive");

    expect(formatBillingCustomerLinkSource("checkout")).toBe("Checkout");
    expect(formatBillingCustomerLinkSource("webhook")).toBe("Webhook");
    expect(formatBillingCustomerLinkSource("operator")).toBe("Operator");
    expect(formatBillingCustomerLinkSource("import")).toBe("Import");
    expect(formatBillingCustomerLinkSource("unknown")).toBe("Unknown");

    expect(formatBillingCustomerLinkConfidence("verified")).toBe("Verified");
    expect(formatBillingCustomerLinkConfidence("review_required")).toBe("Review required");
    expect(formatBillingCustomerLinkConfidence("blocked")).toBe("Blocked");
  });

  it("fails closed on malformed top-level responses", () => {
    const vm = parseBillingCustomerLinkAuditResponse(null);

    expect(vm.ok).toBe(false);
    expect(vm.reason).toBe("unknown_response");
    expect(vm.reasonLabel).toBe("Link audit response was not recognized.");
    expect(vm.counts.total).toBe(0);
    expect(vm.latest).toEqual([]);
  });

  it("parses denied operator responses into safe labels", () => {
    const vm = parseBillingCustomerLinkAuditResponse({ ok: false, reason: "operator_required" });

    expect(vm.ok).toBe(false);
    expect(vm.reason).toBe("operator_required");
    expect(vm.reasonLabel).toBe("Operator role required.");
  });
});

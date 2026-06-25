import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildBillingCustomerLinkCapturePlan } from "@/lib/billingCustomerLinkCaptureRules";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/lib/billingCustomerLinkCaptureRules.ts"),
  "utf8",
);

describe("buildBillingCustomerLinkCapturePlan", () => {
  it("builds a linked checkout capture payload from trusted server context", () => {
    const result = buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: " user_123 ",
      provider: "paddle",
      providerCustomerId: " ctm_123 ",
      providerSubscriptionId: " sub_123 ",
      providerCheckoutId: " chk_123 ",
      lastPaddleEventId: " evt_123 ",
      linkSource: "checkout",
      linkStatus: "linked",
      confidence: "verified",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.conflictTarget).toBe("provider,provider_customer_id");
    expect(result.payload).toEqual({
      user_id: "user_123",
      provider: "paddle",
      provider_customer_id: "ctm_123",
      provider_subscription_id: "sub_123",
      provider_checkout_id: "chk_123",
      link_status: "linked",
      link_source: "checkout",
      confidence: "verified",
      last_paddle_event_id: "evt_123",
    });
  });

  it("allows optional subscription, checkout, and event references", () => {
    const result = buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      linkSource: "webhook",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.provider_subscription_id).toBeNull();
    expect(result.payload.provider_checkout_id).toBeNull();
    expect(result.payload.last_paddle_event_id).toBeNull();
    expect(result.payload.link_source).toBe("webhook");
    expect(result.payload.link_status).toBe("linked");
    expect(result.payload.confidence).toBe("verified");
  });

  it("defaults provider and link metadata conservatively", () => {
    const result = buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.provider).toBe("paddle");
    expect(result.payload.link_source).toBe("unknown");
    expect(result.payload.link_status).toBe("linked");
    expect(result.payload.confidence).toBe("verified");
  });

  it("blocks missing required attribution", () => {
    expect(buildBillingCustomerLinkCapturePlan({
      providerCustomerId: "ctm_123",
    })).toEqual({ ok: false, reason: "missing_user_id" });

    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
    })).toEqual({ ok: false, reason: "missing_provider_customer_id" });
  });

  it("blocks unsupported providers", () => {
    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      provider: "stripe",
      providerCustomerId: "cus_123",
    })).toEqual({ ok: false, reason: "unsupported_provider" });
  });

  it("blocks ambiguous provider customer ownership", () => {
    const result = buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerIds: ["ctm_1", "ctm_2"],
    });

    expect(result).toEqual({ ok: false, reason: "ambiguous_provider_customer_id" });
  });

  it("dedupes repeated equivalent identifiers before ambiguity checks", () => {
    const result = buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_1",
      providerCustomerIds: [" ctm_1 ", "ctm_1"],
      providerSubscriptionId: "sub_1",
      providerSubscriptionIds: ["sub_1", " sub_1 "],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.payload.provider_customer_id).toBe("ctm_1");
    expect(result.payload.provider_subscription_id).toBe("sub_1");
  });

  it("blocks ambiguous optional identifiers", () => {
    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      providerSubscriptionIds: ["sub_1", "sub_2"],
    })).toEqual({ ok: false, reason: "ambiguous_provider_subscription_id" });

    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      providerCheckoutIds: ["chk_1", "chk_2"],
    })).toEqual({ ok: false, reason: "ambiguous_provider_checkout_id" });

    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      lastPaddleEventIds: ["evt_1", "evt_2"],
    })).toEqual({ ok: false, reason: "ambiguous_event_reference" });
  });

  it("blocks invalid metadata enums", () => {
    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      linkSource: "browser",
    })).toEqual({ ok: false, reason: "invalid_link_source" });

    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      linkStatus: "active",
    })).toEqual({ ok: false, reason: "invalid_link_status" });

    expect(buildBillingCustomerLinkCapturePlan({
      authenticatedUserId: "user_123",
      providerCustomerId: "ctm_123",
      confidence: "trusted_client",
    })).toEqual({ ok: false, reason: "invalid_confidence" });
  });

  it("is pure planning logic with no database, network, storage, or entitlement writes", () => {
    expect(SOURCE).not.toMatch(/supabase/i);
    expect(SOURCE).not.toMatch(/fetch\(/);
    expect(SOURCE).not.toMatch(/localStorage|sessionStorage/);
    expect(SOURCE).not.toMatch(/\.from\(/);
    expect(SOURCE).not.toMatch(/\.insert\(/);
    expect(SOURCE).not.toMatch(/\.update\(/);
    expect(SOURCE).not.toMatch(/\.delete\(/);
    expect(SOURCE).not.toMatch(/\.upsert\(/);
    expect(SOURCE).not.toMatch(/functions\.invoke/);
    expect(SOURCE).not.toMatch(/billing_subscriptions/);
    expect(SOURCE).not.toMatch(/service_role/i);
  });
});

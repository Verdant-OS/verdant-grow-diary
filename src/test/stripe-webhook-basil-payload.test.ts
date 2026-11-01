import { describe, expect, it } from "vitest";
import { decideStripeWebhookAction } from "@/lib/stripeWebhookEventRules";
import { runStripeWebhook } from "@/lib/stripeWebhookOrchestrator";
import { computeStripeSignatureHex } from "@/lib/stripeWebhookSignatureRules";

const SECRET = "whsec_test_fixture_only";
const NOW_MS = Date.parse("2026-11-01T16:00:00.000Z");
const USER = "00000000-0000-4000-8000-000000000001";
const PERIOD_END = new Date(1764604800 * 1000).toISOString();

function itemSubscription(
  metadata: Record<string, string> = { user_id: USER, plan_id: "pro_monthly" },
) {
  return {
    id: "sub_testfixture",
    object: "subscription",
    status: "active",
    livemode: false,
    customer: "cus_testfixture",
    cancel_at_period_end: false,
    metadata,
    items: {
      object: "list",
      data: [{ current_period_start: 1762012800, current_period_end: 1764604800 }],
    },
  };
}

describe("stripe webhook payloads for API 2026-02-25.preview", () => {
  it("grants checkout and subscription.created from the subscription item period", () => {
    const checkout = decideStripeWebhookAction({
      id: "evt_checkout",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_fixture",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: USER,
          customer: "cus_testfixture",
          metadata: { user_id: USER, plan_id: "pro_monthly" },
          subscription: itemSubscription(),
        },
      },
    });
    expect(checkout.kind).toBe("apply");
    if (checkout.kind === "apply") {
      expect(checkout.payload.action).toBe("grant_subscription");
      expect(checkout.payload.periodEnd).toBe(PERIOD_END);
    }

    const idOnly = decideStripeWebhookAction({
      id: "evt_checkoutid",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_fixture",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: USER,
          customer: "cus_testfixture",
          metadata: { user_id: USER, plan_id: "pro_monthly" },
          subscription: "sub_testfixture",
        },
      },
    });
    expect(idOnly).toEqual({ kind: "ignore", reason: "period_not_present" });

    const created = decideStripeWebhookAction({
      id: "evt_created",
      type: "customer.subscription.created",
      livemode: false,
      data: { object: itemSubscription() },
    });
    expect(created.kind).toBe("apply");
    if (created.kind === "apply") {
      expect(created.payload.action).toBe("grant_subscription");
      expect(created.payload.periodEnd).toBe(PERIOD_END);
    }
  });

  it("extends a renewal from the subscription item when the subscription has no top-level period", () => {
    const renewed = decideStripeWebhookAction({
      id: "evt_renewed",
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: itemSubscription({ plan_id: "pro_monthly" }),
      },
    });
    expect(renewed.kind).toBe("apply");
    if (renewed.kind === "apply") {
      expect(renewed.payload.action).toBe("update_subscription");
      expect(renewed.payload.periodEnd).toBe(PERIOD_END);
      expect(renewed.payload.periodStart).toBe(new Date(1762012800 * 1000).toISOString());
    }
  });

  it("marks past_due from invoice.parent.subscription_details", () => {
    const failed = decideStripeWebhookAction({
      id: "evt_failedparent",
      type: "invoice.payment_failed",
      livemode: false,
      data: {
        object: {
          id: "in_testfixture",
          object: "invoice",
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_testfixture" },
          },
        },
      },
    });
    expect(failed.kind).toBe("apply");
    if (failed.kind === "apply") {
      expect(failed.payload.action).toBe("mark_past_due");
      expect(failed.payload.stripeSubscriptionId).toBe("sub_testfixture");
    }

    const missing = decideStripeWebhookAction({
      id: "evt_failedmissing",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_testfixture", object: "invoice" } },
    });
    expect(missing).toEqual({ kind: "ignore", reason: "no_subscription" });
  });

  it("loads the checkout subscription id and grants the retrieved item period", async () => {
    const body = JSON.stringify({
      id: "evt_checkoutid",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_fixture",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: USER,
          customer: "cus_testfixture",
          metadata: { user_id: USER, plan_id: "pro_monthly" },
          subscription: "sub_testfixture",
        },
      },
    });
    const timestamp = Math.floor(NOW_MS / 1000);
    const v1 = await computeStripeSignatureHex(SECRET, timestamp, body);
    const applied: Array<{ action: string; periodEnd: string | null }> = [];
    const result = await runStripeWebhook(
      { rawBody: body, signatureHeader: `t=${timestamp},v1=${v1}`, nowMs: NOW_MS },
      {
        getSecret: () => SECRET,
        retrieveSubscription: async (subscriptionId) => ({
          ...itemSubscription(),
          id: subscriptionId,
        }),
        applyEvent: async (payload) => {
          applied.push({ action: payload.action, periodEnd: payload.periodEnd });
          return { ok: true, reason: "applied" };
        },
      },
    );
    expect(result.status).toBe(200);
    expect(applied).toEqual([{ action: "grant_subscription", periodEnd: PERIOD_END }]);
  });

  it("returns 500 when a paid subscription checkout cannot load its subscription", async () => {
    const body = JSON.stringify({
      id: "evt_checkoutid",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_fixture",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: USER,
          customer: "cus_testfixture",
          metadata: { user_id: USER, plan_id: "pro_monthly" },
          subscription: "sub_testfixture",
        },
      },
    });
    const timestamp = Math.floor(NOW_MS / 1000);
    const v1 = await computeStripeSignatureHex(SECRET, timestamp, body);
    let calls = 0;
    const result = await runStripeWebhook(
      { rawBody: body, signatureHeader: `t=${timestamp},v1=${v1}`, nowMs: NOW_MS },
      {
        getSecret: () => SECRET,
        retrieveSubscription: async () => null,
        applyEvent: async () => {
          calls += 1;
          return { ok: true, reason: "applied" };
        },
      },
    );
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "webhook_unavailable" });
    expect(calls).toBe(0);
  });
});

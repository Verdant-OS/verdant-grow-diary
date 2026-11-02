import { describe, expect, it } from "vitest";
import { decideStripeWebhookAction } from "@/lib/stripeWebhookEventRules";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const PERIOD_START = 1762012800;
const PERIOD_END = 1764604800;

function checkoutEvent(subscription: unknown, clientReferenceId: string | undefined = USER) {
  return {
    id: "evt_testfixture",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_fixture",
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: clientReferenceId,
        customer: "cus_testfixture",
        metadata: { user_id: USER, plan_id: "pro_monthly" },
        subscription,
      },
    },
  };
}

describe("basil stripe webhook decisions", () => {
  it("refuses checkout when client_reference_id is missing or does not match metadata.user_id", () => {
    expect(decideStripeWebhookAction(checkoutEvent(undefined, OTHER))).toEqual({
      kind: "refuse",
      error: "malformed",
    });
    const missing = checkoutEvent({
      id: "sub_testfixture",
      status: "active",
      current_period_end: PERIOD_END,
    });
    delete (missing.data.object as { client_reference_id?: string }).client_reference_id;
    expect(decideStripeWebhookAction(missing)).toEqual({ kind: "refuse", error: "malformed" });
  });

  it("grants customer.subscription.created from the subscription item period", () => {
    const created = decideStripeWebhookAction({
      id: "evt_createdbasil",
      type: "customer.subscription.created",
      livemode: false,
      data: {
        object: {
          id: "sub_testfixture",
          object: "subscription",
          status: "active",
          customer: "cus_testfixture",
          cancel_at_period_end: false,
          metadata: { user_id: USER, plan_id: "pro_monthly" },
          items: {
            object: "list",
            data: [
              {
                id: "si_testfixture",
                current_period_start: PERIOD_START,
                current_period_end: PERIOD_END,
              },
            ],
          },
        },
      },
    });
    expect(created.kind).toBe("apply");
    if (created.kind !== "apply") return;
    expect(created.payload.action).toBe("grant_subscription");
    expect(created.payload.userId).toBe(USER);
    expect(created.payload.planId).toBe("pro_monthly");
    expect(created.payload.stripeSubscriptionId).toBe("sub_testfixture");
    expect(created.payload.periodStart).toBe(new Date(PERIOD_START * 1000).toISOString());
    expect(created.payload.periodEnd).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it("renews customer.subscription.updated from the item period when the top-level period is absent", () => {
    const renewed = decideStripeWebhookAction({
      id: "evt_renewedbasil",
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: {
          id: "sub_testfixture",
          object: "subscription",
          status: "active",
          customer: "cus_testfixture",
          metadata: { user_id: USER, plan_id: "pro_annual" },
          items: {
            object: "list",
            data: [
              {
                id: "si_testfixture",
                current_period_start: PERIOD_END,
                current_period_end: 1796140800,
              },
            ],
          },
        },
      },
    });
    expect(renewed.kind).toBe("apply");
    if (renewed.kind !== "apply") return;
    expect(renewed.payload.action).toBe("grant_subscription");
    expect(renewed.payload.planId).toBe("pro_annual");
    expect(renewed.payload.periodEnd).toBe(new Date(1796140800 * 1000).toISOString());
  });

  it("ignores an unexpanded checkout subscription id and grants an expanded basil session", () => {
    expect(decideStripeWebhookAction(checkoutEvent("sub_testfixture"))).toEqual({
      kind: "ignore",
      reason: "subscription_unexpanded",
    });

    const grant = decideStripeWebhookAction(
      checkoutEvent({
        id: "sub_testfixture",
        status: "active",
        cancel_at_period_end: false,
        items: {
          object: "list",
          data: [
            {
              id: "si_testfixture",
              current_period_start: PERIOD_START,
              current_period_end: PERIOD_END,
            },
          ],
        },
      }),
    );
    expect(grant.kind).toBe("apply");
    if (grant.kind !== "apply") return;
    expect(grant.payload.action).toBe("grant_subscription");
    expect(grant.payload.stripeSubscriptionId).toBe("sub_testfixture");
    expect(grant.payload.periodEnd).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it("marks past_due from a basil invoice parent subscription id", () => {
    const failed = decideStripeWebhookAction({
      id: "evt_failedbasil",
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
    if (failed.kind !== "apply") return;
    expect(failed.payload.action).toBe("mark_past_due");
    expect(failed.payload.stripeSubscriptionId).toBe("sub_testfixture");
    expect(failed.payload.planId).toBeNull();
  });
});

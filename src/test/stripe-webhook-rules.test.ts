import { describe, expect, it } from "vitest";
import { decideStripeWebhookAction } from "@/lib/stripeWebhookEventRules";
import { runStripeWebhook } from "@/lib/stripeWebhookOrchestrator";
import {
  computeStripeSignatureHex,
  verifyStripeWebhookSignature,
} from "@/lib/stripeWebhookSignatureRules";

const SECRET = "whsec_test_fixture_only";
const NOW_MS = Date.parse("2026-11-01T16:00:00.000Z");
const USER = "00000000-0000-4000-8000-000000000001";

function event(overrides: Record<string, unknown> = {}) {
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
        client_reference_id: USER,
        customer: "cus_testfixture",
        metadata: { user_id: USER, plan_id: "pro_monthly" },
        subscription: {
          id: "sub_testfixture",
          status: "active",
          current_period_start: 1762012800,
          current_period_end: 1764604800,
          cancel_at_period_end: false,
        },
      },
    },
    ...overrides,
  };
}

async function signed(body: string, secret = SECRET, timestamp = Math.floor(NOW_MS / 1000)) {
  const v1 = await computeStripeSignatureHex(secret, timestamp, body);
  return { header: `t=${timestamp},v1=${v1}`, timestamp };
}

describe("stripe webhook signature", () => {
  it("accepts a matching v1 and rejects tampering, the wrong secret, and replay", async () => {
    const body = JSON.stringify({ id: "evt_testfixture" });
    const good = await signed(body);
    expect(
      (
        await verifyStripeWebhookSignature({
          rawBody: body,
          header: good.header,
          secret: SECRET,
          nowMs: NOW_MS,
        })
      ).ok,
    ).toBe(true);

    const other = await computeStripeSignatureHex("whsec_other", good.timestamp, body);
    const multi = await verifyStripeWebhookSignature({
      rawBody: body,
      header: `${good.header},v1=${other}`,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(multi.ok).toBe(true);

    expect(
      (
        await verifyStripeWebhookSignature({
          rawBody: `${body} `,
          header: good.header,
          secret: SECRET,
          nowMs: NOW_MS,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyStripeWebhookSignature({
          rawBody: body,
          header: good.header,
          secret: "whsec_other",
          nowMs: NOW_MS,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyStripeWebhookSignature({
          rawBody: body,
          header: good.header,
          secret: SECRET,
          nowMs: NOW_MS + 301_000,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyStripeWebhookSignature({
          rawBody: body,
          header: null,
          secret: "",
          nowMs: NOW_MS,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyStripeWebhookSignature({
          rawBody: body,
          header: good.header,
          secret: "sk_live_fixture_only",
          nowMs: NOW_MS,
        })
      ).ok,
    ).toBe(false);
  });
});

describe("decideStripeWebhookAction", () => {
  it("grants a paid test subscription and derives pack credits from the plan id", () => {
    const grant = decideStripeWebhookAction(event());
    expect(grant.kind).toBe("apply");
    if (grant.kind !== "apply") return;
    expect(grant.payload.action).toBe("grant_subscription");
    expect(grant.payload.planId).toBe("pro_monthly");
    expect(grant.payload.stripeSubscriptionId).toBe("sub_testfixture");
    expect(grant.payload.periodEnd).toBe(new Date(1764604800 * 1000).toISOString());

    const pack = decideStripeWebhookAction(
      event({
        data: {
          object: {
            id: "cs_test_pack",
            object: "checkout.session",
            mode: "payment",
            payment_status: "paid",
            client_reference_id: USER,
            customer: "cus_testfixture",
            metadata: { user_id: USER, plan_id: "credit_pack_150", credits: "1" },
          },
        },
      }),
    );
    expect(pack.kind).toBe("apply");
    if (pack.kind !== "apply") return;
    expect(pack.payload.action).toBe("grant_credit_pack");
    expect(pack.payload.planId).toBe("credit_pack_150");
    expect(pack.payload.checkoutSessionId).toBe("cs_test_pack");
    expect(JSON.stringify(pack.payload)).not.toContain('"credits":1');
  });

  it("refuses live mode and Founder with no apply payload", () => {
    expect(decideStripeWebhookAction(event({ livemode: true })).kind).toBe("refuse");
    const founder = decideStripeWebhookAction(
      event({
        data: {
          object: {
            ...(event().data.object as object),
            metadata: { user_id: USER, plan_id: "founder_lifetime" },
          },
        },
      }),
    );
    expect(founder).toEqual({ kind: "refuse", error: "plan_retired" });
  });

  it("does not grant when the period is missing, the payment is unpaid, or the subscription is incomplete", () => {
    const missingPeriod = event();
    delete (missingPeriod.data.object as { subscription: { current_period_end?: number } })
      .subscription.current_period_end;
    expect(decideStripeWebhookAction(missingPeriod).kind).toBe("ignore");

    const unpaid = event();
    (unpaid.data.object as { payment_status: string }).payment_status = "unpaid";
    expect(decideStripeWebhookAction(unpaid).kind).toBe("ignore");

    const updated = decideStripeWebhookAction({
      id: "evt_incomplete",
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: {
          id: "sub_testfixture",
          object: "subscription",
          status: "incomplete",
          metadata: { user_id: USER, plan_id: "pro_monthly" },
          current_period_end: 1764604800,
        },
      },
    });
    expect(updated.kind).toBe("ignore");
  });

  it("cancels on deletion and marks payment failure past_due without a new grant", () => {
    const deleted = decideStripeWebhookAction({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      livemode: false,
      data: { object: { id: "sub_testfixture", object: "subscription", status: "canceled" } },
    });
    expect(deleted.kind).toBe("apply");
    if (deleted.kind === "apply") expect(deleted.payload.action).toBe("cancel_subscription");

    const failed = decideStripeWebhookAction({
      id: "evt_failed",
      type: "invoice.payment_failed",
      livemode: false,
      data: {
        object: { id: "in_testfixture", object: "invoice", subscription: "sub_testfixture" },
      },
    });
    expect(failed.kind).toBe("apply");
    if (failed.kind === "apply") {
      expect(failed.payload.action).toBe("mark_past_due");
      expect(failed.payload.planId).toBeNull();
    }
  });
});

describe("runStripeWebhook", () => {
  it("does not call the database when the signature is bad or the event is live", async () => {
    let calls = 0;
    const applyEvent = async () => {
      calls += 1;
      return { ok: true, reason: "applied" };
    };
    const body = JSON.stringify(event());
    const bad = await runStripeWebhook(
      { rawBody: body, signatureHeader: "t=1,v1=abcd", nowMs: NOW_MS },
      { getSecret: () => SECRET, applyEvent },
    );
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "invalid_signature" });
    expect(calls).toBe(0);

    const good = await signed(JSON.stringify(event({ livemode: true })));
    const live = await runStripeWebhook(
      {
        rawBody: JSON.stringify(event({ livemode: true })),
        signatureHeader: good.header,
        nowMs: NOW_MS,
      },
      { getSecret: () => SECRET, applyEvent },
    );
    expect(live.status).toBe(400);
    expect(live.body).toEqual({ error: "live_mode_refused" });
    expect(calls).toBe(0);
  });

  it("applies a verified paid session once", async () => {
    const applied: unknown[] = [];
    const body = JSON.stringify(event());
    const good = await signed(body);
    const result = await runStripeWebhook(
      { rawBody: body, signatureHeader: good.header, nowMs: NOW_MS },
      {
        getSecret: () => SECRET,
        applyEvent: async (payload) => {
          applied.push(payload);
          return { ok: true, reason: "applied" };
        },
      },
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true });
    expect(applied).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mapRecordedPaddleEventToEntitlementDecision,
  type PaddleEntitlementPriceConfig,
  type RecordedPaddleEventLike,
} from "@/lib/paddleEventEntitlementMapperRules";

const PRICE_CONFIG: PaddleEntitlementPriceConfig = {
  proMonthlyPriceId: "pri_pro_monthly",
  proAnnualPriceId: "pri_pro_annual",
  founderLifetimePriceId: "pri_founder_lifetime",
};

const MAPPER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/lib/paddleEventEntitlementMapperRules.ts"),
  "utf8",
);

function eventKey(eventType: string): string {
  return eventType.split(".").join("_");
}

function recorded(event_type: string, data: Record<string, unknown>): RecordedPaddleEventLike {
  return {
    event_id: `evt_${eventKey(event_type)}`,
    event_type,
    environment: "sandbox",
    signature_verified: true,
    received_at: "2026-06-20T00:00:00.000Z",
    payload: {
      event_id: `evt_${eventKey(event_type)}`,
      event_type,
      occurred_at: "2026-06-20T00:00:01.000Z",
      data,
    },
  };
}

function subscriptionData(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer_id: "ctm_123",
    items: [{ price: { id: "pri_pro_monthly" } }],
    current_billing_period: { ends_at: "2026-07-20T00:00:00.000Z" },
    ...overrides,
  };
}

describe("mapRecordedPaddleEventToEntitlementDecision", () => {
  it("processes a verified subscription.created event into an active Pro Monthly candidate", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.created", subscriptionData()),
      PRICE_CONFIG,
    );

    expect(result.state).toBe("process");
    if (result.state !== "process") throw new Error("expected process");
    expect(result.candidatePlanId).toBe("pro_monthly");
    expect(result.candidateStatus).toBe("active");
    expect(result.providerCustomerId).toBe("ctm_123");
    expect(result.providerSubscriptionId).toBe("sub_123");
    expect(result.providerPriceId).toBe("pri_pro_monthly");
    expect(result.currentPeriodEnd).toBe("2026-07-20T00:00:00.000Z");
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.isFounderCandidate).toBe(false);
  });

  it("maps status-specific subscription events conservatively", () => {
    const pastDue = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.past_due", subscriptionData()),
      PRICE_CONFIG,
    );
    const paused = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.paused", subscriptionData()),
      PRICE_CONFIG,
    );
    const canceled = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.canceled", subscriptionData()),
      PRICE_CONFIG,
    );
    const resumed = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.resumed", subscriptionData()),
      PRICE_CONFIG,
    );

    expect(pastDue.state === "process" && pastDue.candidateStatus).toBe("past_due");
    expect(paused.state === "process" && paused.candidateStatus).toBe("paused");
    expect(canceled.state === "process" && canceled.candidateStatus).toBe("canceled");
    expect(resumed.state === "process" && resumed.candidateStatus).toBe("active");
  });

  it("processes a Founder Lifetime transaction without requiring a recurring subscription id", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("transaction.completed", {
        id: "txn_123",
        customer_id: "ctm_founder",
        items: [{ price: { id: "pri_founder_lifetime" } }],
      }),
      PRICE_CONFIG,
    );

    expect(result.state).toBe("process");
    if (result.state !== "process") throw new Error("expected process");
    expect(result.candidatePlanId).toBe("founder_lifetime");
    expect(result.candidateStatus).toBe("active");
    expect(result.providerCustomerId).toBe("ctm_founder");
    expect(result.providerSubscriptionId).toBeNull();
    expect(result.currentPeriodEnd).toBeNull();
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.isFounderCandidate).toBe(true);
  });

  it("blocks recurring transaction.completed when subscription id is missing", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("transaction.completed", {
        id: "txn_123",
        customer_id: "ctm_123",
        items: [{ price: { id: "pri_pro_annual" } }],
      }),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "block", reason: "missing_subscription_id" });
  });

  it("processes recurring transaction.completed when subscription id is present", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("transaction.completed", {
        id: "txn_123",
        customer_id: "ctm_123",
        subscription_id: "sub_annual",
        items: [{ price: { id: "pri_pro_annual" } }],
      }),
      PRICE_CONFIG,
    );

    expect(result.state).toBe("process");
    if (result.state !== "process") throw new Error("expected process");
    expect(result.candidatePlanId).toBe("pro_annual");
    expect(result.providerSubscriptionId).toBe("sub_annual");
  });

  it("extracts cancel-at-period-end intent from subscription.updated scheduled_change", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded(
        "subscription.updated",
        subscriptionData({ scheduled_change: { action: "cancel" } }),
      ),
      PRICE_CONFIG,
    );

    expect(result.state).toBe("process");
    if (result.state !== "process") throw new Error("expected process");
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it("blocks unverified event rows before looking at payload data", () => {
    const event = recorded("subscription.created", subscriptionData());
    event.signature_verified = false;

    const result = mapRecordedPaddleEventToEntitlementDecision(event, PRICE_CONFIG);

    expect(result).toMatchObject({ state: "block", reason: "event_not_verified" });
  });

  it("blocks wrong-environment event rows", () => {
    const event = recorded("subscription.created", subscriptionData());
    event.environment = "live";

    const result = mapRecordedPaddleEventToEntitlementDecision(event, PRICE_CONFIG);

    expect(result).toMatchObject({ state: "block", reason: "environment_not_allowed" });
  });

  it("blocks mismatched recorded and payload event types", () => {
    const event = recorded("subscription.created", subscriptionData());
    if (event.payload && typeof event.payload === "object") {
      (event.payload as Record<string, unknown>).event_type = "subscription.updated";
    }

    const result = mapRecordedPaddleEventToEntitlementDecision(event, PRICE_CONFIG);

    expect(result).toMatchObject({ state: "block", reason: "event_type_mismatch" });
  });

  it("blocks unknown price ids", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.created", subscriptionData({ items: [{ price: { id: "pri_unknown" } }] })),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "block", reason: "unknown_price_id" });
  });

  it("blocks ambiguous mixed-plan price ids", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded(
        "subscription.created",
        subscriptionData({
          items: [
            { price: { id: "pri_pro_monthly" } },
            { price: { id: "pri_pro_annual" } },
          ],
        }),
      ),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "block", reason: "ambiguous_price_ids" });
  });

  it("blocks processable events that cannot be linked to a provider customer", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("subscription.created", subscriptionData({ customer_id: null })),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "block", reason: "missing_customer_id" });
  });

  it("ignores non-granting transaction events", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("transaction.payment_failed", {
        id: "txn_failed",
        customer_id: "ctm_123",
        items: [{ price: { id: "pri_pro_monthly" } }],
      }),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "ignore", reason: "non_granting_transaction_event" });
  });

  it("ignores adjustment events until refund and credit-note policy is implemented", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("adjustment.created", {
        id: "adj_123",
        customer_id: "ctm_123",
        items: [{ price: { id: "pri_pro_monthly" } }],
      }),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "ignore", reason: "adjustment_event_requires_policy" });
  });

  it("ignores unrelated Paddle event types", () => {
    const result = mapRecordedPaddleEventToEntitlementDecision(
      recorded("customer.updated", { id: "ctm_123" }),
      PRICE_CONFIG,
    );

    expect(result).toMatchObject({ state: "ignore", reason: "unsupported_event_type" });
  });

  it("is pure mapping logic with no network, database, storage, or entitlement writes", () => {
    expect(MAPPER_SOURCE).not.toMatch(/supabase/i);
    expect(MAPPER_SOURCE).not.toMatch(/fetch\(/);
    expect(MAPPER_SOURCE).not.toMatch(/localStorage|sessionStorage/);
    expect(MAPPER_SOURCE).not.toMatch(/\.from\(/);
    expect(MAPPER_SOURCE).not.toMatch(/\.insert\(/);
    expect(MAPPER_SOURCE).not.toMatch(/\.update\(/);
    expect(MAPPER_SOURCE).not.toMatch(/\.delete\(/);
    expect(MAPPER_SOURCE).not.toMatch(/\.upsert\(/);
    expect(MAPPER_SOURCE).not.toMatch(/functions\.invoke/);
    expect(MAPPER_SOURCE).not.toMatch(/service_role/i);
  });
});

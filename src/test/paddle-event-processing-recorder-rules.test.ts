import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildFailedPaddleEventProcessingInsertPayload,
  buildPaddleEventProcessingInsertPayload,
  type RecordedPaddleEventProcessingSource,
} from "@/lib/paddleEventProcessingRecorderRules";
import type {
  NormalizedPaddleEntitlementBlockDecision,
  NormalizedPaddleEntitlementIgnoreDecision,
  NormalizedPaddleEntitlementProcessDecision,
} from "@/lib/paddleEventEntitlementMapperRules";

const RECORDER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/lib/paddleEventProcessingRecorderRules.ts"),
  "utf8",
);

const SOURCE: RecordedPaddleEventProcessingSource = {
  id: "00000000-0000-4000-8000-000000000001",
  event_id: "evt_123",
  event_type: "subscription.created",
  environment: "sandbox",
};

const PROCESS_DECISION: NormalizedPaddleEntitlementProcessDecision = {
  state: "process",
  eventType: "subscription.created",
  providerEventId: "evt_123",
  providerOccurredAt: "2026-06-20T00:00:00.000Z",
  candidatePlanId: "pro_monthly",
  candidateStatus: "active",
  providerCustomerId: "ctm_123",
  providerSubscriptionId: "sub_123",
  providerPriceId: "pri_pro_monthly",
  currentPeriodEnd: "2026-07-20T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  isFounderCandidate: false,
};

const IGNORE_DECISION: NormalizedPaddleEntitlementIgnoreDecision = {
  state: "ignore",
  eventType: "transaction.payment_failed",
  providerEventId: "evt_failed",
  providerOccurredAt: "2026-06-20T00:00:01.000Z",
  reason: "non_granting_transaction_event",
};

const BLOCK_DECISION: NormalizedPaddleEntitlementBlockDecision = {
  state: "block",
  eventType: "subscription.created",
  providerEventId: "evt_blocked",
  providerOccurredAt: "2026-06-20T00:00:02.000Z",
  reason: "missing_customer_id",
};

describe("paddle event processing recorder rules", () => {
  it("builds a processed insert payload from a process mapper decision", () => {
    const payload = buildPaddleEventProcessingInsertPayload(SOURCE, PROCESS_DECISION);

    expect(payload).toEqual({
      paddle_event_id: SOURCE.id,
      event_id: SOURCE.event_id,
      event_type: SOURCE.event_type,
      environment: SOURCE.environment,
      status: "processed",
      reason: null,
      candidate_plan_id: "pro_monthly",
      candidate_status: "active",
      provider_customer_id: "ctm_123",
      provider_subscription_id: "sub_123",
      provider_price_id: "pri_pro_monthly",
      current_period_end: "2026-07-20T00:00:00.000Z",
      cancel_at_period_end: false,
      is_founder_candidate: false,
      details: {
        phase: "mapper_decision",
        decision_state: "process",
        provider_event_id: "evt_123",
        provider_occurred_at: "2026-06-20T00:00:00.000Z",
        event_type: "subscription.created",
      },
    });
  });

  it("builds a processed Founder payload without a subscription id or period end", () => {
    const payload = buildPaddleEventProcessingInsertPayload(SOURCE, {
      ...PROCESS_DECISION,
      candidatePlanId: "founder_lifetime",
      providerCustomerId: "ctm_founder",
      providerSubscriptionId: null,
      providerPriceId: "pri_founder_lifetime",
      currentPeriodEnd: null,
      isFounderCandidate: true,
    });

    expect(payload.status).toBe("processed");
    expect(payload.candidate_plan_id).toBe("founder_lifetime");
    expect(payload.provider_subscription_id).toBeNull();
    expect(payload.current_period_end).toBeNull();
    expect(payload.is_founder_candidate).toBe(true);
  });

  it("builds an ignored insert payload from an ignore mapper decision", () => {
    const payload = buildPaddleEventProcessingInsertPayload(
      { ...SOURCE, event_id: "evt_failed", event_type: "transaction.payment_failed" },
      IGNORE_DECISION,
    );

    expect(payload.status).toBe("ignored");
    expect(payload.reason).toBe("non_granting_transaction_event");
    expect(payload.candidate_plan_id).toBeNull();
    expect(payload.candidate_status).toBeNull();
    expect(payload.provider_customer_id).toBeNull();
    expect(payload.details).toMatchObject({
      phase: "mapper_decision",
      decision_state: "ignore",
      provider_event_id: "evt_failed",
    });
  });

  it("builds a blocked insert payload from a block mapper decision", () => {
    const payload = buildPaddleEventProcessingInsertPayload(SOURCE, BLOCK_DECISION);

    expect(payload.status).toBe("blocked");
    expect(payload.reason).toBe("missing_customer_id");
    expect(payload.provider_price_id).toBeNull();
    expect(payload.cancel_at_period_end).toBe(false);
    expect(payload.is_founder_candidate).toBe(false);
    expect(payload.details).toMatchObject({
      phase: "mapper_decision",
      decision_state: "block",
      provider_event_id: "evt_blocked",
    });
  });

  it("builds a failed insert payload for transient/internal processing failures", () => {
    const payload = buildFailedPaddleEventProcessingInsertPayload(SOURCE, "mapper_exception", {
      safe_code: "unexpected_shape",
    });

    expect(payload.status).toBe("failed");
    expect(payload.reason).toBe("mapper_exception");
    expect(payload.candidate_plan_id).toBeNull();
    expect(payload.provider_customer_id).toBeNull();
    expect(payload.details).toEqual({
      phase: "processing_failure",
      safe_code: "unexpected_shape",
    });
  });

  it("trims source identifiers before building payloads", () => {
    const payload = buildPaddleEventProcessingInsertPayload(
      {
        id: " 00000000-0000-4000-8000-000000000001 ",
        event_id: " evt_trimmed ",
        event_type: " subscription.updated ",
        environment: " sandbox ",
      },
      PROCESS_DECISION,
    );

    expect(payload.event_id).toBe("evt_trimmed");
    expect(payload.event_type).toBe("subscription.updated");
    expect(payload.environment).toBe("sandbox");
  });

  it("throws before building an invalid source payload", () => {
    expect(() => buildPaddleEventProcessingInsertPayload(
      { ...SOURCE, event_id: "" },
      PROCESS_DECISION,
    )).toThrow("paddle_event_processing_source_event_id_required");

    expect(() => buildFailedPaddleEventProcessingInsertPayload(
      SOURCE,
      " ",
    )).toThrow("paddle_event_processing_failed_reason_required");
  });

  it("is pure payload-building logic with no network, database, storage, or entitlement writes", () => {
    expect(RECORDER_SOURCE).not.toMatch(/supabase/i);
    expect(RECORDER_SOURCE).not.toMatch(/fetch\(/);
    expect(RECORDER_SOURCE).not.toMatch(/localStorage|sessionStorage/);
    expect(RECORDER_SOURCE).not.toMatch(/\.from\(/);
    expect(RECORDER_SOURCE).not.toMatch(/\.insert\(/);
    expect(RECORDER_SOURCE).not.toMatch(/\.update\(/);
    expect(RECORDER_SOURCE).not.toMatch(/\.delete\(/);
    expect(RECORDER_SOURCE).not.toMatch(/\.upsert\(/);
    expect(RECORDER_SOURCE).not.toMatch(/functions\.invoke/);
    expect(RECORDER_SOURCE).not.toMatch(/billing_subscriptions/);
    expect(RECORDER_SOURCE).not.toMatch(/service_role/i);
  });
});

import type {
  NormalizedPaddleEntitlementDecision,
  NormalizedPaddleEntitlementProcessDecision,
} from "@/lib/paddleEventEntitlementMapperRules";
import type { PlanId, SubscriptionStatus } from "@/lib/entitlements/types";

export type PaddleEventProcessingStatus = "processed" | "ignored" | "blocked" | "failed";

export interface RecordedPaddleEventProcessingSource {
  id: string;
  event_id: string;
  event_type: string;
  environment: string;
}

export interface PaddleEventProcessingInsertPayload {
  paddle_event_id: string;
  event_id: string;
  event_type: string;
  environment: string;
  status: PaddleEventProcessingStatus;
  reason: string | null;
  candidate_plan_id: PlanId | null;
  candidate_status: SubscriptionStatus | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_founder_candidate: boolean;
  details: Record<string, unknown>;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function assertSource(source: RecordedPaddleEventProcessingSource): void {
  for (const [key, value] of Object.entries({
    id: source.id,
    event_id: source.event_id,
    event_type: source.event_type,
    environment: source.environment,
  })) {
    if (!cleanString(value)) {
      throw new Error(`paddle_event_processing_source_${key}_required`);
    }
  }
}

function basePayload(
  source: RecordedPaddleEventProcessingSource,
  status: PaddleEventProcessingStatus,
  reason: string | null,
  details: Record<string, unknown>,
): PaddleEventProcessingInsertPayload {
  assertSource(source);
  return {
    paddle_event_id: source.id,
    event_id: source.event_id.trim(),
    event_type: source.event_type.trim(),
    environment: source.environment.trim(),
    status,
    reason,
    candidate_plan_id: null,
    candidate_status: null,
    provider_customer_id: null,
    provider_subscription_id: null,
    provider_price_id: null,
    current_period_end: null,
    cancel_at_period_end: false,
    is_founder_candidate: false,
    details,
  };
}

function processDetails(decision: NormalizedPaddleEntitlementProcessDecision): Record<string, unknown> {
  return {
    phase: "mapper_decision",
    decision_state: decision.state,
    provider_event_id: decision.providerEventId,
    provider_occurred_at: decision.providerOccurredAt,
    event_type: decision.eventType,
  };
}

function decisionReason(decision: NormalizedPaddleEntitlementDecision): string | null {
  return decision.state === "process" ? null : decision.reason;
}

export function buildPaddleEventProcessingInsertPayload(
  source: RecordedPaddleEventProcessingSource,
  decision: NormalizedPaddleEntitlementDecision,
): PaddleEventProcessingInsertPayload {
  const status: PaddleEventProcessingStatus = decision.state === "process"
    ? "processed"
    : decision.state === "ignore"
      ? "ignored"
      : "blocked";

  const payload = basePayload(
    source,
    status,
    decisionReason(decision),
    decision.state === "process"
      ? processDetails(decision)
      : {
        phase: "mapper_decision",
        decision_state: decision.state,
        provider_event_id: decision.providerEventId,
        provider_occurred_at: decision.providerOccurredAt,
        event_type: decision.eventType,
      },
  );

  if (decision.state !== "process") {
    return payload;
  }

  return {
    ...payload,
    candidate_plan_id: decision.candidatePlanId,
    candidate_status: decision.candidateStatus,
    provider_customer_id: decision.providerCustomerId,
    provider_subscription_id: decision.providerSubscriptionId,
    provider_price_id: decision.providerPriceId,
    current_period_end: decision.currentPeriodEnd,
    cancel_at_period_end: decision.cancelAtPeriodEnd,
    is_founder_candidate: decision.isFounderCandidate,
  };
}

export function buildFailedPaddleEventProcessingInsertPayload(
  source: RecordedPaddleEventProcessingSource,
  reason: string,
  details: Record<string, unknown> = {},
): PaddleEventProcessingInsertPayload {
  const cleanReason = cleanString(reason);
  if (!cleanReason) {
    throw new Error("paddle_event_processing_failed_reason_required");
  }

  return basePayload(source, "failed", cleanReason, {
    phase: "processing_failure",
    ...details,
  });
}

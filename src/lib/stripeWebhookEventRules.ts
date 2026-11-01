/**
 * Pure Stripe webhook decisions. Grants only the four subscriptions and two
 * credit packs, and only in test mode. Founder Lifetime is never allocated.
 * Credit counts are taken from the catalog, never from event metadata.
 * A missing billing period does not produce a subscription grant.
 */
import {
  classifyStripePlanId,
  isCheckoutUserId,
  isStripeCustomerId,
  isStripeEventId,
  isStripeSubscriptionId,
  isStripeTestCheckoutSessionId,
} from "@/lib/stripeTestModeCatalogRules";

export type StripeWebhookAction =
  | "grant_subscription"
  | "update_subscription"
  | "cancel_subscription"
  | "mark_past_due"
  | "grant_credit_pack"
  | "record_only";

export interface StripeWebhookApplyPayload {
  eventId: string;
  eventType: string;
  action: StripeWebhookAction;
  userId: string | null;
  planId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  checkoutSessionId: string | null;
  occurredAt: string | null;
}

export type StripeWebhookDecision =
  | { kind: "refuse"; error: "live_mode_refused" | "plan_retired" | "malformed" }
  | { kind: "ignore"; reason: string }
  | { kind: "apply"; payload: StripeWebhookApplyPayload };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function emptyPayload(
  eventId: string,
  eventType: string,
  action: StripeWebhookAction,
): StripeWebhookApplyPayload {
  return {
    eventId,
    eventType,
    action,
    userId: null,
    planId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    checkoutSessionId: null,
    occurredAt: null,
  };
}

function customerId(value: unknown): string | null {
  if (typeof value === "string" && isStripeCustomerId(value)) return value;
  const record = asRecord(value);
  const nested = readString(record, "id");
  return nested && isStripeCustomerId(nested) ? nested : null;
}

function subscriptionId(value: unknown): string | null {
  if (typeof value === "string" && isStripeSubscriptionId(value)) return value;
  const record = asRecord(value);
  const nested = readString(record, "id");
  return nested && isStripeSubscriptionId(nested) ? nested : null;
}

function planDecision(planId: string | null): StripeWebhookDecision | null {
  if (!planId) return null;
  const plan = classifyStripePlanId(planId);
  if (plan.kind === "retired") return { kind: "refuse", error: "plan_retired" };
  return null;
}

function checkoutUser(object: Record<string, unknown>): string | null {
  const metadata = asRecord(object.metadata);
  const fromMetadata = readString(metadata, "user_id");
  const fromReference = readString(object, "client_reference_id");
  if (!fromMetadata || !fromReference || fromMetadata !== fromReference) return null;
  return isCheckoutUserId(fromMetadata) ? fromMetadata : null;
}

function decideCheckout(eventId: string, object: Record<string, unknown>): StripeWebhookDecision {
  const metadata = asRecord(object.metadata);
  const planId = readString(metadata, "plan_id");
  const retired = planDecision(planId);
  if (retired) return retired;
  const plan = planId ? classifyStripePlanId(planId) : { kind: "unknown" as const };
  if (plan.kind === "unknown") return { kind: "refuse", error: "malformed" };
  if (readString(object, "payment_status") !== "paid") return { kind: "ignore", reason: "unpaid" };

  const userId = checkoutUser(object);
  const sessionId = readString(object, "id");
  if (!userId || !sessionId || !isStripeTestCheckoutSessionId(sessionId)) {
    return { kind: "refuse", error: "malformed" };
  }

  if (plan.kind === "credit_pack") {
    if (readString(object, "mode") !== "payment") return { kind: "refuse", error: "malformed" };
    return {
      kind: "apply",
      payload: {
        ...emptyPayload(eventId, "checkout.session.completed", "grant_credit_pack"),
        userId,
        planId: plan.planId,
        stripeCustomerId: customerId(object.customer),
        checkoutSessionId: sessionId,
      },
    };
  }

  if (plan.kind !== "subscription") return { kind: "refuse", error: "malformed" };
  if (readString(object, "mode") !== "subscription") return { kind: "refuse", error: "malformed" };
  const subscription = asRecord(object.subscription);
  const stripeSubscriptionId = subscriptionId(object.subscription);
  const periodEnd = unixToIso(subscription?.current_period_end);
  const status = readString(subscription, "status");
  if (!stripeSubscriptionId || !periodEnd || (status !== "active" && status !== "trialing")) {
    return { kind: "ignore", reason: "period_not_present" };
  }
  return {
    kind: "apply",
    payload: {
      ...emptyPayload(eventId, "checkout.session.completed", "grant_subscription"),
      userId,
      planId: plan.planId,
      stripeCustomerId: customerId(object.customer),
      stripeSubscriptionId,
      status,
      periodStart: unixToIso(subscription?.current_period_start),
      periodEnd,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
      checkoutSessionId: sessionId,
    },
  };
}

function decideSubscription(
  eventId: string,
  eventType: string,
  object: Record<string, unknown>,
  deleted: boolean,
): StripeWebhookDecision {
  const metadata = asRecord(object.metadata);
  const planId = readString(metadata, "plan_id");
  const retired = planDecision(planId);
  if (retired) return retired;
  const stripeSubscriptionId = subscriptionId(object.id);
  if (!stripeSubscriptionId) return { kind: "refuse", error: "malformed" };

  if (deleted) {
    return {
      kind: "apply",
      payload: {
        ...emptyPayload(eventId, eventType, "cancel_subscription"),
        stripeSubscriptionId,
        userId: readString(metadata, "user_id"),
        planId,
        status: "canceled",
      },
    };
  }

  const status = readString(object, "status");
  if (status === "incomplete" || status === "incomplete_expired") {
    return { kind: "ignore", reason: "incomplete_not_granted" };
  }
  if (status === "unpaid" || status === "past_due") {
    return {
      kind: "apply",
      payload: {
        ...emptyPayload(eventId, eventType, "mark_past_due"),
        stripeSubscriptionId,
        status: "past_due",
      },
    };
  }
  if (status === "canceled") {
    return {
      kind: "apply",
      payload: {
        ...emptyPayload(eventId, eventType, "cancel_subscription"),
        stripeSubscriptionId,
        status: "canceled",
      },
    };
  }

  const plan = planId ? classifyStripePlanId(planId) : { kind: "unknown" as const };
  const periodEnd = unixToIso(object.current_period_end);
  if (
    plan.kind !== "subscription" ||
    !periodEnd ||
    (status !== "active" && status !== "trialing" && status !== "paused")
  ) {
    return { kind: "ignore", reason: "period_not_present" };
  }
  const userId = readString(metadata, "user_id");
  if (status === "paused" || !userId || !isCheckoutUserId(userId)) {
    return {
      kind: "apply",
      payload: {
        ...emptyPayload(eventId, eventType, "update_subscription"),
        stripeSubscriptionId,
        planId: plan.planId,
        status,
        periodEnd,
        cancelAtPeriodEnd: object.cancel_at_period_end === true,
      },
    };
  }
  return {
    kind: "apply",
    payload: {
      ...emptyPayload(eventId, eventType, "grant_subscription"),
      userId,
      planId: plan.planId,
      stripeCustomerId: customerId(object.customer),
      stripeSubscriptionId,
      status,
      periodStart: unixToIso(object.current_period_start),
      periodEnd,
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
    },
  };
}

export function decideStripeWebhookAction(event: unknown): StripeWebhookDecision {
  const record = asRecord(event);
  const eventId = readString(record, "id");
  const eventType = readString(record, "type");
  if (!record || !eventId || !eventType || !isStripeEventId(eventId)) {
    return { kind: "refuse", error: "malformed" };
  }
  if (record.livemode === true) return { kind: "refuse", error: "live_mode_refused" };
  if (record.livemode !== false) return { kind: "refuse", error: "malformed" };

  const data = asRecord(record.data);
  const object = asRecord(data?.object);
  if (!object) return { kind: "refuse", error: "malformed" };

  let decision: StripeWebhookDecision;
  switch (eventType) {
    case "checkout.session.completed":
      decision = decideCheckout(eventId, object);
      break;
    case "customer.subscription.updated":
      decision = decideSubscription(eventId, eventType, object, false);
      break;
    case "customer.subscription.deleted":
      decision = decideSubscription(eventId, eventType, object, true);
      break;
    case "invoice.payment_failed": {
      const stripeSubscriptionId = subscriptionId(object.subscription);
      if (!stripeSubscriptionId) return { kind: "ignore", reason: "no_subscription" };
      decision = {
        kind: "apply",
        payload: {
          ...emptyPayload(eventId, eventType, "mark_past_due"),
          stripeSubscriptionId,
          status: "past_due",
        },
      };
      break;
    }
    default:
      return { kind: "ignore", reason: "unhandled_event" };
  }

  if (decision.kind !== "apply") return decision;
  return {
    kind: "apply",
    payload: { ...decision.payload, occurredAt: unixToIso(record.created) },
  };
}

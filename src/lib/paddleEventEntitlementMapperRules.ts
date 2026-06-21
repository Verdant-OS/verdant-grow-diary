import type { PlanId, SubscriptionStatus } from "@/lib/entitlements/types";

export type PaddleEntitlementEventType =
  | "transaction.completed"
  | "transaction.payment_failed"
  | "transaction.canceled"
  | "adjustment.created"
  | "adjustment.updated"
  | "subscription.created"
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.past_due"
  | "subscription.paused"
  | "subscription.resumed"
  | "subscription.canceled";

export type PaddleEntitlementMapperState = "process" | "ignore" | "block";

export type PaddleEntitlementBlockReason =
  | "event_not_verified"
  | "environment_not_allowed"
  | "missing_event_type"
  | "event_type_mismatch"
  | "payload_required"
  | "payload_data_required"
  | "unknown_price_id"
  | "ambiguous_price_ids"
  | "missing_customer_id"
  | "missing_subscription_id"
  | "founder_subscription_not_required"
  | "unsupported_payload_shape";

export type PaddleEntitlementIgnoreReason =
  | "unsupported_event_type"
  | "non_granting_transaction_event"
  | "adjustment_event_requires_policy";

export interface PaddleEntitlementPriceConfig {
  proMonthlyPriceId: string;
  proAnnualPriceId: string;
  founderLifetimePriceId: string;
}

export interface RecordedPaddleEventLike {
  event_id?: unknown;
  event_type?: unknown;
  environment?: unknown;
  signature_verified?: unknown;
  payload?: unknown;
  received_at?: unknown;
}

export interface NormalizedPaddleEntitlementDecisionBase {
  state: PaddleEntitlementMapperState;
  eventType: string | null;
  providerEventId: string | null;
  providerOccurredAt: string | null;
}

export interface NormalizedPaddleEntitlementProcessDecision
  extends NormalizedPaddleEntitlementDecisionBase {
  state: "process";
  candidatePlanId: PlanId;
  candidateStatus: SubscriptionStatus;
  providerCustomerId: string;
  providerSubscriptionId: string | null;
  providerPriceId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isFounderCandidate: boolean;
}

export interface NormalizedPaddleEntitlementIgnoreDecision
  extends NormalizedPaddleEntitlementDecisionBase {
  state: "ignore";
  reason: PaddleEntitlementIgnoreReason;
}

export interface NormalizedPaddleEntitlementBlockDecision
  extends NormalizedPaddleEntitlementDecisionBase {
  state: "block";
  reason: PaddleEntitlementBlockReason;
}

export type NormalizedPaddleEntitlementDecision =
  | NormalizedPaddleEntitlementProcessDecision
  | NormalizedPaddleEntitlementIgnoreDecision
  | NormalizedPaddleEntitlementBlockDecision;

interface MapperContext {
  eventType: string | null;
  providerEventId: string | null;
  providerOccurredAt: string | null;
}

const PROCESSABLE_EVENTS = new Set<PaddleEntitlementEventType>([
  "transaction.completed",
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

const NON_GRANTING_TRANSACTION_EVENTS = new Set<string>([
  "transaction.payment_failed",
  "transaction.canceled",
]);

const ADJUSTMENT_EVENTS = new Set<string>([
  "adjustment.created",
  "adjustment.updated",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readPath(root: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function firstStringPath(root: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    const v = readString(readPath(root, path));
    if (v) return v;
  }
  return null;
}

function readPayloadObject(payload: unknown): Record<string, unknown> | null {
  return isRecord(payload) ? payload : null;
}

function readPayloadData(payload: Record<string, unknown>): Record<string, unknown> | null {
  const data = payload.data;
  if (isRecord(data)) return data;
  return payload;
}

function makeBase(event: RecordedPaddleEventLike): MapperContext {
  const payload = readPayloadObject(event.payload);
  return {
    eventType: readString(event.event_type) ?? (payload ? readString(payload.event_type) : null),
    providerEventId: readString(event.event_id) ?? (payload ? readString(payload.event_id) : null),
    providerOccurredAt: payload
      ? firstStringPath(payload, [["occurred_at"], ["created_at"], ["notification", "occurred_at"]])
      : null,
  };
}

function block(ctx: MapperContext, reason: PaddleEntitlementBlockReason): NormalizedPaddleEntitlementBlockDecision {
  return { state: "block", reason, ...ctx };
}

function ignore(ctx: MapperContext, reason: PaddleEntitlementIgnoreReason): NormalizedPaddleEntitlementIgnoreDecision {
  return { state: "ignore", reason, ...ctx };
}

function priceIdsFromObject(obj: Record<string, unknown>): string[] {
  const out = new Set<string>();

  const direct = firstStringPath(obj, [["price_id"], ["price", "id"], ["price", "price_id"]]);
  if (direct) out.add(direct);

  const items = obj.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!isRecord(item)) continue;
      const priceId = firstStringPath(item, [
        ["price_id"],
        ["price", "id"],
        ["price", "price_id"],
        ["product", "price_id"],
      ]);
      if (priceId) out.add(priceId);
    }
  }

  const lineItems = obj.line_items;
  if (Array.isArray(lineItems)) {
    for (const item of lineItems) {
      if (!isRecord(item)) continue;
      const priceId = firstStringPath(item, [["price_id"], ["price", "id"]]);
      if (priceId) out.add(priceId);
    }
  }

  return [...out];
}

function planFromPriceId(priceId: string, config: PaddleEntitlementPriceConfig): PlanId | null {
  if (priceId === config.proMonthlyPriceId) return "pro_monthly";
  if (priceId === config.proAnnualPriceId) return "pro_annual";
  if (priceId === config.founderLifetimePriceId) return "founder_lifetime";
  return null;
}

function selectPlan(
  data: Record<string, unknown>,
  config: PaddleEntitlementPriceConfig,
): { ok: true; priceId: string; planId: PlanId } | { ok: false; reason: "unknown_price_id" | "ambiguous_price_ids" } {
  const mapped = priceIdsFromObject(data)
    .map((priceId) => ({ priceId, planId: planFromPriceId(priceId, config) }))
    .filter((x): x is { priceId: string; planId: PlanId } => x.planId !== null);

  const uniquePlans = new Map<PlanId, string>();
  for (const item of mapped) uniquePlans.set(item.planId, item.priceId);

  if (uniquePlans.size === 0) return { ok: false, reason: "unknown_price_id" };
  if (uniquePlans.size > 1) return { ok: false, reason: "ambiguous_price_ids" };

  const [[planId, priceId]] = [...uniquePlans.entries()];
  return { ok: true, planId, priceId };
}

function statusFromEventType(eventType: string): SubscriptionStatus {
  switch (eventType) {
    case "subscription.past_due":
      return "past_due";
    case "subscription.paused":
      return "paused";
    case "subscription.canceled":
      return "canceled";
    case "subscription.created":
    case "subscription.activated":
    case "subscription.updated":
    case "subscription.resumed":
    case "transaction.completed":
    default:
      return "active";
  }
}

function currentPeriodEndFromData(data: Record<string, unknown>): string | null {
  return firstStringPath(data, [
    ["current_billing_period", "ends_at"],
    ["billing_period", "ends_at"],
    ["next_billed_at"],
    ["access_until"],
  ]);
}

function cancelAtPeriodEndFromData(data: Record<string, unknown>): boolean {
  return readBool(readPath(data, ["scheduled_change", "action"])) === null &&
    readString(readPath(data, ["scheduled_change", "action"])) === "cancel";
}

function customerIdFromData(data: Record<string, unknown>): string | null {
  return firstStringPath(data, [["customer_id"], ["customer", "id"]]);
}

function subscriptionIdFromData(data: Record<string, unknown>, eventType: string): string | null {
  const explicit = firstStringPath(data, [["subscription_id"], ["subscription", "id"]]);
  if (explicit) return explicit;

  return eventType.startsWith("subscription.") ? firstStringPath(data, [["id"]]) : null;
}

export function mapRecordedPaddleEventToEntitlementDecision(
  event: RecordedPaddleEventLike,
  config: PaddleEntitlementPriceConfig,
  allowedEnvironment = "sandbox",
): NormalizedPaddleEntitlementDecision {
  const ctx = makeBase(event);

  if (event.signature_verified !== true) return block(ctx, "event_not_verified");

  const env = readString(event.environment);
  if (env !== allowedEnvironment) return block(ctx, "environment_not_allowed");

  if (!ctx.eventType) return block(ctx, "missing_event_type");

  const payload = readPayloadObject(event.payload);
  if (!payload) return block(ctx, "payload_required");

  const payloadEventType = readString(payload.event_type);
  if (payloadEventType && payloadEventType !== ctx.eventType) {
    return block(ctx, "event_type_mismatch");
  }

  if (NON_GRANTING_TRANSACTION_EVENTS.has(ctx.eventType)) {
    return ignore(ctx, "non_granting_transaction_event");
  }
  if (ADJUSTMENT_EVENTS.has(ctx.eventType)) {
    return ignore(ctx, "adjustment_event_requires_policy");
  }
  if (!PROCESSABLE_EVENTS.has(ctx.eventType as PaddleEntitlementEventType)) {
    return ignore(ctx, "unsupported_event_type");
  }

  const data = readPayloadData(payload);
  if (!data) return block(ctx, "payload_data_required");

  const selectedPlan = selectPlan(data, config);
  if (!selectedPlan.ok) return block(ctx, selectedPlan.reason);

  const customerId = customerIdFromData(data);
  if (!customerId) return block(ctx, "missing_customer_id");

  const isFounderCandidate = selectedPlan.planId === "founder_lifetime";
  const subscriptionId = subscriptionIdFromData(data, ctx.eventType);
  if (!isFounderCandidate && !subscriptionId) return block(ctx, "missing_subscription_id");

  return {
    state: "process",
    eventType: ctx.eventType,
    providerEventId: ctx.providerEventId,
    providerOccurredAt: ctx.providerOccurredAt,
    candidatePlanId: selectedPlan.planId,
    candidateStatus: isFounderCandidate ? "active" : statusFromEventType(ctx.eventType),
    providerCustomerId: customerId,
    providerSubscriptionId: isFounderCandidate ? subscriptionId : subscriptionId,
    providerPriceId: selectedPlan.priceId,
    currentPeriodEnd: isFounderCandidate ? null : currentPeriodEndFromData(data),
    cancelAtPeriodEnd: isFounderCandidate ? false : cancelAtPeriodEndFromData(data),
    isFounderCandidate,
  };
}

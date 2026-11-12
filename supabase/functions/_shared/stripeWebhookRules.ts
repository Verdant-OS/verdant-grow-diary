/**
 * Pure rules for the Stripe subscription webhook (Slice C of
 * docs/specs/stripe-live-checkout-plan.md).
 *
 * No I/O except Web Crypto HMAC, no clock (callers pass `nowSeconds`), no
 * Deno globals. Pinned by src/test/stripe-webhook-rules.test.ts.
 *
 *  - Signature: Stripe-Signature `t=<unix>,v1=<hex>[,v1=<hex>]`, HMAC-SHA256
 *    over `${t}.${rawBody}` with the endpoint secret, checked on the exact raw
 *    bytes before anything is parsed. Any v1 may match (secret rotation).
 *    Older than the tolerance, or too far in the future, is refused.
 *  - A Stripe row grants only through a readable plan key (pro_monthly,
 *    pro_annual) mapped from a server-configured price id. An unmapped price
 *    produces no row.
 *  - The user id comes from subscription metadata that our own checkout
 *    function set from a verified JWT; it must be a UUID.
 */

import { hmacSha256Hex } from "./verifyPaddleSignature.ts";
import { timingSafeEqual } from "./lib/lib/timingSafeCompareRules.ts";
import {
  STRIPE_CHECKOUT_PLAN_KEYS,
  stripePriceEnvName,
  type StripeBillingEnvironment,
  type StripeCheckoutPlanKey,
} from "./stripeCheckoutRules.ts";

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
export const STRIPE_SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 60;

/** The four event types the endpoint is subscribed to. */
export const STRIPE_WEBHOOK_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type StripeSignatureRefusal =
  | "secret_missing"
  | "header_missing"
  | "header_malformed"
  | "timestamp_too_old"
  | "timestamp_in_future"
  | "signature_mismatch";

export function parseStripeSignatureHeader(
  header: unknown,
): { timestamp: number; signatures: string[] } | null {
  if (typeof header !== "string" || header.length === 0) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export async function verifyStripeSignature(input: {
  rawBody: string;
  header: string | null;
  secret: string | undefined;
  nowSeconds: number;
}): Promise<{ ok: true } | { ok: false; reason: StripeSignatureRefusal }> {
  const secret = (input.secret ?? "").trim();
  if (secret === "") return { ok: false, reason: "secret_missing" };
  if (input.header === null || input.header === "") return { ok: false, reason: "header_missing" };
  const parsed = parseStripeSignatureHeader(input.header);
  if (parsed === null) return { ok: false, reason: "header_malformed" };
  if (input.nowSeconds - parsed.timestamp > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_too_old" };
  }
  if (parsed.timestamp - input.nowSeconds > STRIPE_SIGNATURE_MAX_FUTURE_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp_in_future" };
  }
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${input.rawBody}`);
  // Compare every candidate; do not stop at the first match.
  let matched = false;
  for (const candidate of parsed.signatures) {
    if (timingSafeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/** A Stripe id field that may arrive as a string or an expanded object. */
function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  const object = asObject(value);
  return object && typeof object.id === "string" && object.id.length > 0 ? object.id : null;
}

const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9]+$/;
const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHandledEventType(type: unknown): boolean {
  return (
    typeof type === "string" && (STRIPE_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type)
  );
}

export function eventLivemodeMatches(
  event: unknown,
  environment: StripeBillingEnvironment,
): boolean {
  const livemode = asObject(event)?.livemode;
  if (typeof livemode !== "boolean") return false;
  return livemode === (environment === "live");
}

/**
 * The subscription an event is about, or null when the event is not about a
 * subscription Verdant sells (for example a one-time payment session).
 */
export function subscriptionIdFromEvent(event: unknown): string | null {
  const root = asObject(event);
  const object = asObject(asObject(root?.data)?.object);
  if (!root || !object) return null;
  let id: string | null = null;
  if (root.type === "checkout.session.completed") {
    if (object.mode !== "subscription") return null;
    id = idOf(object.subscription);
  } else if (typeof root.type === "string" && root.type.startsWith("customer.subscription.")) {
    id = idOf(object.id);
  }
  return id !== null && SUBSCRIPTION_ID_RE.test(id) ? id : null;
}

/**
 * Stripe subscription status → the status values public.subscriptions
 * allows. `incomplete` means the first payment has not gone through, so
 * nothing is recorded yet. `unpaid` (retries exhausted) and
 * `incomplete_expired` record as expired, which grants nothing.
 */
export function mapStripeSubscriptionStatus(
  status: unknown,
): "active" | "trialing" | "past_due" | "canceled" | "paused" | "expired" | null {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "paused":
      return status;
    case "unpaid":
    case "incomplete_expired":
      return "expired";
    default:
      return null;
  }
}

/** Server price id → readable plan key, from the env of one environment. */
export function buildStripePriceToPlanMap(
  environment: StripeBillingEnvironment,
  getEnv: (name: string) => string | undefined,
): ReadonlyMap<string, StripeCheckoutPlanKey> {
  const map = new Map<string, StripeCheckoutPlanKey>();
  for (const plan of STRIPE_CHECKOUT_PLAN_KEYS) {
    const priceId = (getEnv(stripePriceEnvName(plan, environment)) ?? "").trim();
    if (/^price_[A-Za-z0-9]+$/.test(priceId) && !map.has(priceId)) map.set(priceId, plan);
  }
  return map;
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

export interface StripeSubscriptionRowWrite {
  user_id: string;
  billing_provider: "stripe";
  stripe_subscription_id: string;
  stripe_customer_id: string;
  paddle_subscription_id: null;
  paddle_customer_id: null;
  product_id: string;
  price_id: StripeCheckoutPlanKey;
  status: "active" | "trialing" | "past_due" | "canceled" | "paused" | "expired";
  current_period_start: string | null;
  current_period_end: string;
  cancel_at_period_end: boolean;
  environment: StripeBillingEnvironment;
}

export type StripeRowSkip =
  | "not_a_subscription"
  | "livemode_mismatch"
  | "subscription_id_invalid"
  | "customer_missing"
  | "user_id_missing"
  | "user_id_invalid"
  | "item_count_unsupported"
  | "price_unmapped"
  | "status_not_recorded"
  | "period_end_missing";

/**
 * Build the row to upsert for a subscription re-read from Stripe. The
 * subscription object, not the event, is the source, so replays and
 * out-of-order deliveries all write the subscription's current state.
 *
 * Stripe moved `current_period_*` from the subscription to its items in newer
 * API versions, so both places are read, top level first.
 */
export function buildStripeSubscriptionRow(input: {
  subscription: unknown;
  environment: StripeBillingEnvironment;
  priceToPlan: ReadonlyMap<string, StripeCheckoutPlanKey>;
}): { ok: true; row: StripeSubscriptionRowWrite } | { ok: false; reason: StripeRowSkip } {
  const sub = asObject(input.subscription);
  if (!sub || sub.object !== "subscription") return { ok: false, reason: "not_a_subscription" };
  if (typeof sub.livemode !== "boolean" || sub.livemode !== (input.environment === "live")) {
    return { ok: false, reason: "livemode_mismatch" };
  }
  const subscriptionId = idOf(sub.id);
  if (subscriptionId === null || !SUBSCRIPTION_ID_RE.test(subscriptionId)) {
    return { ok: false, reason: "subscription_id_invalid" };
  }
  const customerId = idOf(sub.customer);
  if (customerId === null || !CUSTOMER_ID_RE.test(customerId)) {
    return { ok: false, reason: "customer_missing" };
  }
  const userId = asObject(sub.metadata)?.user_id;
  if (typeof userId !== "string" || userId === "") return { ok: false, reason: "user_id_missing" };
  if (!UUID_RE.test(userId)) return { ok: false, reason: "user_id_invalid" };

  const items = asObject(sub.items)?.data;
  if (!Array.isArray(items) || items.length !== 1) {
    return { ok: false, reason: "item_count_unsupported" };
  }
  const item = asObject(items[0]);
  const price = asObject(item?.price);
  const priceId = idOf(price?.id);
  const plan = priceId === null ? undefined : input.priceToPlan.get(priceId);
  if (plan === undefined) return { ok: false, reason: "price_unmapped" };

  const status = mapStripeSubscriptionStatus(sub.status);
  if (status === null) return { ok: false, reason: "status_not_recorded" };

  let periodEnd = unixToIso(sub.current_period_end) ?? unixToIso(item?.current_period_end);
  if (periodEnd === null) return { ok: false, reason: "period_end_missing" };
  // An immediate cancel (for example with a refund) ends access when it
  // ended, not at the end of the period it had paid for.
  const endedAt = unixToIso(sub.ended_at);
  if (status === "canceled" && endedAt !== null && endedAt < periodEnd) periodEnd = endedAt;
  const periodStart = unixToIso(sub.current_period_start) ?? unixToIso(item?.current_period_start);

  return {
    ok: true,
    row: {
      user_id: userId.toLowerCase(),
      billing_provider: "stripe",
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      paddle_subscription_id: null,
      paddle_customer_id: null,
      product_id: idOf(price?.product) ?? plan,
      price_id: plan,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end === true,
      environment: input.environment,
    },
  };
}

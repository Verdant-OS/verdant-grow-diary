/**
 * Verifies a Stripe test-mode webhook, then asks the caller to apply one
 * already-decided payload. A bad signature, a live-mode event, or a Founder
 * plan never reaches applyEvent. Checkout delivers the subscription id only;
 * the caller loads that Subscription before the grant decision.
 */
import { isStripeSubscriptionId } from "@/lib/stripeTestModeCatalogRules";
import {
  decideStripeWebhookAction,
  type StripeWebhookApplyPayload,
} from "@/lib/stripeWebhookEventRules";
import { verifyStripeWebhookSignature } from "@/lib/stripeWebhookSignatureRules";

export interface StripeWebhookDeps {
  getSecret: () => string | undefined;
  applyEvent: (payload: StripeWebhookApplyPayload) => Promise<{ ok: boolean; reason: string }>;
  retrieveSubscription?: (subscriptionId: string) => Promise<unknown>;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function checkoutSubscriptionId(event: unknown): string | null {
  const record = asObject(event);
  if (!record || record.type !== "checkout.session.completed") return null;
  const data = asObject(record.data);
  const object = asObject(data?.object);
  const subscription = object?.subscription;
  return typeof subscription === "string" && isStripeSubscriptionId(subscription)
    ? subscription
    : null;
}

function withCheckoutSubscription(event: unknown, subscription: Record<string, unknown>): unknown {
  const record = asObject(event);
  const data = asObject(record?.data);
  const object = asObject(data?.object);
  if (!record || !data || !object) return event;
  return {
    ...record,
    data: {
      ...data,
      object: { ...object, subscription },
    },
  };
}

export async function runStripeWebhook(
  input: { rawBody: string; signatureHeader: string | null; nowMs: number },
  deps: StripeWebhookDeps,
): Promise<{ status: number; body: { error: string } | { received: true } }> {
  const verified = await verifyStripeWebhookSignature({
    rawBody: input.rawBody,
    header: input.signatureHeader,
    secret: deps.getSecret() ?? "",
    nowMs: input.nowMs,
  });
  if (!verified.ok) return { status: 400, body: { error: "invalid_signature" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "malformed" } };
  }

  if (
    parsed != null &&
    typeof parsed === "object" &&
    (parsed as { livemode?: unknown }).livemode === true
  ) {
    return { status: 400, body: { error: "live_mode_refused" } };
  }

  const pendingSubscriptionId = checkoutSubscriptionId(parsed);
  if (pendingSubscriptionId) {
    if (!deps.retrieveSubscription) return { status: 500, body: { error: "webhook_unavailable" } };
    let retrieved: unknown;
    try {
      retrieved = await deps.retrieveSubscription(pendingSubscriptionId);
    } catch {
      return { status: 500, body: { error: "webhook_unavailable" } };
    }
    const subscription = asObject(retrieved);
    if (!subscription || subscription.id !== pendingSubscriptionId) {
      return { status: 500, body: { error: "webhook_unavailable" } };
    }
    if (subscription.livemode === true)
      return { status: 400, body: { error: "live_mode_refused" } };
    if (subscription.livemode !== false)
      return { status: 500, body: { error: "webhook_unavailable" } };
    parsed = withCheckoutSubscription(parsed, subscription);
  }

  const decision = decideStripeWebhookAction(parsed);
  if (decision.kind === "refuse") return { status: 400, body: { error: decision.error } };
  if (decision.kind === "ignore") return { status: 200, body: { received: true } };

  let applied: { ok: boolean; reason: string };
  try {
    applied = await deps.applyEvent(decision.payload);
  } catch {
    return { status: 500, body: { error: "webhook_unavailable" } };
  }
  if (!applied.ok) {
    if (applied.reason === "plan_retired" || applied.reason === "live_mode_refused") {
      return { status: 400, body: { error: applied.reason } };
    }
    return { status: 500, body: { error: "webhook_unavailable" } };
  }
  return { status: 200, body: { received: true } };
}

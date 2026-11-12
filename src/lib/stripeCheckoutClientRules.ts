/**
 * Pure client rules for the Stripe Pro checkout start (Slice D of
 * docs/specs/stripe-live-checkout-plan.md). No React, no Supabase, no window.
 *
 * Presentation only: the stripe-checkout Edge function decides who may buy
 * and what. These rules pick the provider, read its answer, and refuse to
 * redirect anywhere but Stripe's hosted checkout.
 */
import type { ProCheckoutProvider } from "@/config/checkoutProvider";
import { STRIPE_CHECKOUT_COPY } from "@/constants/stripeCheckoutCopy";

export const STRIPE_PRO_PLAN_KEYS = ["pro_monthly", "pro_annual"] as const;
export type StripeProPlanKey = (typeof STRIPE_PRO_PLAN_KEYS)[number];

export function isStripeProPlanKey(value: unknown): value is StripeProPlanKey {
  return typeof value === "string" && (STRIPE_PRO_PLAN_KEYS as readonly string[]).includes(value);
}

/** True only when the switch says Stripe and the plan is a Pro plan. */
export function shouldUseStripeCheckout(
  planId: unknown,
  provider: ProCheckoutProvider,
): planId is StripeProPlanKey {
  return provider === "stripe" && isStripeProPlanKey(planId);
}

/** The hosted checkout URL to send the browser to, or null. */
export function readStripeCheckoutUrl(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const url = (data as { url?: unknown }).url;
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://checkout.stripe.com" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Calm, fixed copy for a refusal code from the function. */
export function stripeCheckoutErrorMessage(code: string | null): string {
  if (code === "already_subscribed") return STRIPE_CHECKOUT_COPY.alreadySubscribed;
  if (code === "auth_required") return STRIPE_CHECKOUT_COPY.signInRequired;
  return STRIPE_CHECKOUT_COPY.unavailable;
}

/**
 * The Stripe side is not live here: the server said it is not configured, or
 * the function is not deployed (404). The click then falls back to Paddle.
 */
export function shouldFallBackToPaddle(result: {
  ok: boolean;
  code?: string | null;
  status?: number | null;
}): boolean {
  if (result.ok) return false;
  return result.code === "stripe_not_configured" || result.status === 404;
}

/**
 * Which provider opens a NEW Pro checkout from /pricing.
 *
 * "stripe" sends new Pro sales to the stripe-checkout Edge function. Cheek
 * chose this on 2026-11-12 15:55 UTC ("Switch to Stripe"; plan decision 5 in
 * docs/specs/stripe-live-checkout-plan.md). Paddle code is frozen, not
 * removed: existing Paddle subscribers keep working and credit packs still
 * use Paddle. "paddle" restores the previous Pro checkout.
 *
 * Release order matters: this only works once stripe-checkout and
 * stripe-webhook are deployed and their secrets and price ids are set. Ship
 * the frontend with "stripe" before that and the Pro button shows
 * "Checkout isn't available right now" instead of opening Paddle.
 */
export type ProCheckoutProvider = "paddle" | "stripe";

export const PRO_CHECKOUT_PROVIDER: ProCheckoutProvider = "stripe";

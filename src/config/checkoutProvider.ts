/**
 * Which provider opens a NEW Pro checkout from /pricing and /upgrade.
 *
 * "paddle" keeps today's behavior exactly. Switching this to "stripe" sends
 * new Pro sales to the stripe-checkout Edge function instead. That switch is
 * Cheek's decision (plan decision 5 in docs/specs/stripe-live-checkout-plan.md:
 * freeze new Paddle sales or keep both), and it only works once the Stripe
 * functions are deployed and their secrets are set. Change it in its own
 * reviewed PR. Existing Paddle subscribers are unaffected either way.
 */
export type ProCheckoutProvider = "paddle" | "stripe";

export const PRO_CHECKOUT_PROVIDER: ProCheckoutProvider = "paddle";

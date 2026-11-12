/**
 * Which provider opens a NEW Pro checkout from /pricing.
 *
 * Cheek chose Stripe for new Pro sales on 2026-11-12 15:55 UTC ("Switch to
 * Stripe"; plan decision 5 in docs/specs/stripe-live-checkout-plan.md). The
 * switch takes effect only when the site is built with
 * VITE_PRO_CHECKOUT_PROVIDER=stripe, which is set after stripe-checkout and
 * stripe-webhook are deployed with their secrets and price ids. Until then,
 * and for any other value, Pro stays on Paddle, so a frontend that ships
 * before the Stripe side is live never shows a dead Pro button.
 *
 * Paddle code is frozen, not removed: existing Paddle subscribers keep
 * working and credit packs still use Paddle. Even with the flag on, a click
 * falls back to Paddle when the server says Stripe is not configured.
 */
export type ProCheckoutProvider = "paddle" | "stripe";

/** Only the exact value "stripe" turns Stripe on. Anything else is Paddle. */
export function resolveProCheckoutProvider(raw: unknown): ProCheckoutProvider {
  return raw === "stripe" ? "stripe" : "paddle";
}

export const PRO_CHECKOUT_PROVIDER: ProCheckoutProvider = resolveProCheckoutProvider(
  import.meta.env.VITE_PRO_CHECKOUT_PROVIDER,
);

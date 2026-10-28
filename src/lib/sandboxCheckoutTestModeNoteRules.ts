import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

export const SANDBOX_CHECKOUT_TEST_MODE_NOTE = "Test mode: no real charges are made";

/** Anchor on the pricing FAQ item whose question is "Is checkout live?". */
export const CHECKOUT_LIVE_FAQ_ID = "pricing-faq-checkout-live";

/** Accordion item value for the "Is checkout live?" FAQ item on /pricing. */
export const CHECKOUT_LIVE_FAQ_ITEM_VALUE = "checkout-status";

/**
 * Resolves the Pricing FAQ accordion item value to expand for a given URL hash,
 * or null when the hash does not target the checkout-live FAQ anchor.
 */
export function resolvePricingFaqValueForHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  if (normalized === CHECKOUT_LIVE_FAQ_ID) return CHECKOUT_LIVE_FAQ_ITEM_VALUE;
  return null;
}

/**
 * Customer-facing notice for a sandbox checkout. Shown to everyone, including
 * signed-out visitors and non-operators, whenever checkout resolves to sandbox.
 * Live and unavailable checkouts get no note. This does not change the token,
 * the environment, or whether checkout can open.
 */
export function sandboxCheckoutTestModeNote(
  environment: PaddleCheckoutEnvironment | null | undefined,
): string | null {
  if (environment === "sandbox") return SANDBOX_CHECKOUT_TEST_MODE_NOTE;
  return null;
}

import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

export const SANDBOX_CHECKOUT_TEST_MODE_NOTE = "Test mode: no real charges are made";

/** Anchor on the pricing FAQ item whose question is "Is checkout live?". */
export const CHECKOUT_LIVE_FAQ_ID = "pricing-faq-checkout-live";

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

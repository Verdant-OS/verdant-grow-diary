import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

export const SANDBOX_CHECKOUT_TEST_MODE_NOTE = "Test mode: no real charges are made";

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

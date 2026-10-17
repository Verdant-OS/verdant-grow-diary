import { useHydrated } from "@/hooks/useHydrated";
import { resolvePaddleCheckout, resolvePaddleCheckoutBeforeHydration } from "@/lib/paddle";
import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

/**
 * Checkout environment for RENDERING only.
 *
 * The server has no hostname, so it cannot apply the production-host rule.
 * During the server render and React's hydration pass this returns the
 * token-only presentation (live token → "live"), which is exactly what the
 * production browser renders, so the markup matches. After hydration it
 * returns the real host-checked value, so a live token on a preview, staging
 * or local host re-renders as "unavailable".
 *
 * Opening checkout must still call `resolvePaddleCheckout()` at action time.
 */
export function useRenderedPaddleCheckoutEnvironment(): PaddleCheckoutEnvironment {
  const hydrated = useHydrated();
  return hydrated ? resolvePaddleCheckout() : resolvePaddleCheckoutBeforeHydration();
}

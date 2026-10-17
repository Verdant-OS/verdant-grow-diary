import { useHydrated } from "@/hooks/useHydrated";
import { resolvePaddleCheckout, resolvePaddleCheckoutBeforeHydration } from "@/lib/paddle";
import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";

/**
 * Checkout environment for RENDERING only.
 *
 * The server render resolves against the request host and the browser against
 * `window.location.hostname` (see `renderHostname`), so both apply the
 * production-host rule and the markup matches: a live token renders "live"
 * only when the page is served from a production hostname, including in the
 * server HTML.
 *
 * Opening checkout must still call `resolvePaddleCheckout()` at action time.
 */
export function useRenderedPaddleCheckoutEnvironment(): PaddleCheckoutEnvironment {
  const hydrated = useHydrated();
  return hydrated ? resolvePaddleCheckout() : resolvePaddleCheckoutBeforeHydration();
}

import { useState } from "react";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { useAuth } from "@/store/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";

export interface OpenCheckoutOptions {
  priceId: string;
  quantity?: number;
  successUrl?: string;
}

/**
 * Default post-checkout landing. When the current page carries a sanitized
 * `returnTo` (e.g. the Pheno upgrade gate links to /pricing?returnTo=...),
 * forward it to /checkout/success so the buyer lands back on the gated
 * surface they came from once entitlement is confirmed. Raw query values
 * never reach the URL un-sanitized.
 */
function defaultSuccessUrl(): string {
  const returnTo = sanitizeCheckoutReturnTo(
    new URLSearchParams(window.location.search).get("returnTo"),
  );
  const base = `${window.location.origin}/checkout/success`;
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

/**
 * Opens the Lovable built-in Paddle overlay checkout.
 *
 * SAFETY:
 *  - If the user is not signed in, redirects to /auth with a return-to
 *    parameter so we never open a checkout that cannot be attributed
 *    to a user via `customData.userId`.
 *  - `customData.userId` is required so the Paddle webhook can attribute
 *    the subscription to the correct user (see paddle-checkout knowledge).
 *  - This hook does NOT grant entitlements. Backend webhook + Phase 2
 *    entitlement bridge do that.
 */
export function usePaddleCheckout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const openCheckout = async (options: OpenCheckoutOptions) => {
    if (!user) {
      // Preserve the full current path (including any returnTo) through the
      // auth detour so the round-trip back to a gated surface survives.
      // NOTE: /auth reads `redirectTo` (sanitized via sanitizeAuthRedirect) —
      // the previous `redirect` param was silently ignored.
      const back = `${window.location.pathname}${window.location.search}` || "/pricing";
      navigate(`/auth?redirectTo=${encodeURIComponent(back)}`);
      return;
    }
    setLoading(true);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(options.priceId);

      (window as any).Paddle.Checkout.open({
        items: [
          { priceId: paddlePriceId, quantity: options.quantity ?? 1 },
        ],
        customer: user.email ? { email: user.email } : undefined,
        customData: { userId: user.id },
        settings: {
          displayMode: "overlay",
          successUrl: options.successUrl || defaultSuccessUrl(),
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch (err) {
      toast({
        title: "Checkout unavailable",
        description:
          err instanceof Error
            ? err.message
            : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}

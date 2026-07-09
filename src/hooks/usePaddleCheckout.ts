import { useState } from "react";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import { useAuth } from "@/store/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

export interface OpenCheckoutOptions {
  priceId: string;
  quantity?: number;
  successUrl?: string;
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
      navigate(`/auth?redirect=${encodeURIComponent("/pricing")}`);
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
          successUrl:
            options.successUrl ||
            `${window.location.origin}/checkout/success`,
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

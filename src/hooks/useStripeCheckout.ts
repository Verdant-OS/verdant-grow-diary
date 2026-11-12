import { useCallback, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { requestStripeCheckout } from "@/lib/stripeCheckoutService";
import {
  shouldFallBackToPaddle,
  stripeCheckoutErrorMessage,
  type StripeProPlanKey,
} from "@/lib/stripeCheckoutClientRules";

export type StripeCheckoutOutcome = "redirecting" | "fallback" | "failed" | "busy";

/**
 * Start a Stripe hosted Checkout for Pro and send the browser there.
 *
 * - A repeat tap while one start is in flight does nothing ("busy").
 * - `loading` stays true while the browser leaves for Stripe, so the button
 *   stays disabled through the redirect.
 * - "fallback" means the Stripe side is not live here; the caller opens
 *   Paddle instead, and no error is shown.
 */
export function useStripeCheckout(): {
  startStripeCheckout: (plan: StripeProPlanKey) => Promise<StripeCheckoutOutcome>;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const startStripeCheckout = useCallback(
    async (plan: StripeProPlanKey): Promise<StripeCheckoutOutcome> => {
      if (inFlight.current) return "busy";
      inFlight.current = true;
      setLoading(true);
      const result = await requestStripeCheckout(plan);
      if (result.ok) {
        window.location.assign(result.url);
        return "redirecting";
      }
      inFlight.current = false;
      setLoading(false);
      if (shouldFallBackToPaddle(result)) return "fallback";
      toast({ title: stripeCheckoutErrorMessage(result.code) });
      return "failed";
    },
    [],
  );

  return { startStripeCheckout, loading };
}

import { useCallback, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { requestStripeCheckout } from "@/lib/stripeCheckoutService";
import { stripeCheckoutErrorMessage, type StripeProPlanKey } from "@/lib/stripeCheckoutClientRules";

/**
 * Start a Stripe hosted Checkout for Pro and send the browser there.
 * A repeat tap while one start is in flight does nothing.
 */
export function useStripeCheckout(): {
  startStripeCheckout: (plan: StripeProPlanKey) => Promise<void>;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const startStripeCheckout = useCallback(async (plan: StripeProPlanKey) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await requestStripeCheckout(plan);
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      toast({ title: stripeCheckoutErrorMessage(result.code) });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  return { startStripeCheckout, loading };
}

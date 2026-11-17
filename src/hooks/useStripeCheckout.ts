import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { markCheckoutStarted } from "@/lib/checkoutContextRules";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { requestStripeCheckout } from "@/lib/stripeCheckoutService";
import { consumePlanIntent, peekPlanIntent } from "@/lib/checkoutPlanIntent";
import { PRO_CHECKOUT_PROVIDER } from "@/config/checkoutProvider";
import { useAuth } from "@/store/auth";
import {
  shouldFallBackToPaddle,
  shouldUseStripeCheckout,
  stripeCheckoutErrorMessage,
  type StripeProPlanKey,
} from "@/lib/stripeCheckoutClientRules";

export type StripeCheckoutOutcome = "redirecting" | "fallback" | "failed" | "busy" | "auth";

/**
 * Start a Stripe hosted Checkout for Pro and send the browser there.
 *
 * - A repeat tap while one start is in flight does nothing ("busy").
 * - `loading` stays true while the browser leaves for Stripe, so the button
 *   stays disabled through the redirect.
 * - "fallback" means the Stripe side is not live here; the caller opens
 *   Paddle instead, and no error is shown.
 * - On a valid session it records checkout_started and the checkout-context
 *   marker before leaving, as the Paddle path does.
 * - Coming Back from Stripe restores the page from the back-forward cache
 *   with `loading` still true, so a `pageshow` from that cache resets it and
 *   the Pro button works again.
 */
export function useStripeCheckout(options?: { onFallback?: (plan: StripeProPlanKey) => void }): {
  startStripeCheckout: (plan: StripeProPlanKey) => Promise<StripeCheckoutOutcome>;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const onFallbackRef = useRef(options?.onFallback);
  onFallbackRef.current = options?.onFallback;

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      inFlight.current = false;
      setLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const startStripeCheckout = useCallback(
    async (plan: StripeProPlanKey): Promise<StripeCheckoutOutcome> => {
      if (inFlight.current) return "busy";
      // Auth still resolving: do not toast auth_required and do not leave
      // for Stripe. The signed-out route lives on Pricing; this guard stops
      // a direct call from showing that toast once auth has settled.
      if (!authLoading && user == null) return "auth";
      inFlight.current = true;
      setLoading(true);
      const result = await requestStripeCheckout(plan);
      if (result.ok) {
        // Same funnel ping and same-device checkout marker as the Paddle
        // path, so /checkout/success shows "confirming" and can record
        // subscription_activated. Only after the server handed back a valid
        // session: a fallback to Paddle records its own start.
        trackFunnelEvent("checkout_started", { plan });
        markCheckoutStarted(Date.now(), "plan");
        window.location.assign(result.url);
        return "redirecting";
      }
      inFlight.current = false;
      setLoading(false);
      if (shouldFallBackToPaddle(result)) return "fallback";
      toast({ title: stripeCheckoutErrorMessage(result.code) });
      return "failed";
    },
    [authLoading, user],
  );

  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (authLoading || user == null) return;
    if (PRO_CHECKOUT_PROVIDER !== "stripe") return;
    if (resumeAttemptedRef.current) return;
    const peeked = peekPlanIntent();
    if (!shouldUseStripeCheckout(peeked, PRO_CHECKOUT_PROVIDER)) return;
    resumeAttemptedRef.current = true;
    // consumePlanIntent drops expired and tampered records. Peek does not,
    // so the checkout start must use the consumed value.
    const pending = consumePlanIntent();
    if (!shouldUseStripeCheckout(pending, PRO_CHECKOUT_PROVIDER)) return;
    void startStripeCheckout(pending).then((outcome) => {
      if (outcome === "fallback") onFallbackRef.current?.(pending);
    });
  }, [authLoading, user, startStripeCheckout]);

  return { startStripeCheckout, loading };
}

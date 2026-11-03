/**
 * stripePortal — client helper that mints a Stripe Billing Portal URL via
 * the `createStripePortalSession` server function and opens it in a new tab.
 *
 * PRESENTATION-ONLY: the server function is the security boundary (auth
 * middleware verified, customer id read from the caller's own RLS-scoped
 * subscription row). This module owns UX state (opening flag, one-shot
 * error surface) and new-tab handling. Portal URLs are one-shot per
 * session; always mint fresh. The portal cannot be embedded in an iframe.
 */
import { useCallback, useState } from "react";
import { createStripePortalSession } from "@/lib/payments/stripe.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export const STRIPE_PORTAL_UNAVAILABLE_MESSAGE =
  "We couldn't open the Stripe billing portal. Please try again in a moment or contact support.";

export interface OpenStripePortalResult {
  ok: boolean;
  error?: string;
}

export async function openStripeCustomerPortal(): Promise<OpenStripePortalResult> {
  try {
    const result = await createStripePortalSession({
      data: { environment: getStripeEnvironment(), origin: window.location.origin },
    });
    if ("error" in result) return { ok: false, error: result.error };
    // noopener/noreferrer: never let the portal window reach back into the app.
    window.open(result.url, "_blank", "noopener,noreferrer");
    return { ok: true };
  } catch {
    return { ok: false, error: STRIPE_PORTAL_UNAVAILABLE_MESSAGE };
  }
}

/** Small hook mirroring useOpenCustomerPortalState for the Stripe lane. */
export function useOpenStripeCustomerPortalState() {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    const result = await openStripeCustomerPortal();
    setOpening(false);
    if (!result.ok && result.error) setError(result.error);
    return result;
  }, []);

  return {
    opening,
    error,
    open,
    clearError: useCallback(() => setError(null), []),
  };
}

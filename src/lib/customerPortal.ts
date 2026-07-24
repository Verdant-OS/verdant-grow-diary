/**
 * customerPortal — client helper that mints a Paddle customer-portal URL
 * via the `paddle-portal-session` edge function and opens it in a new tab.
 *
 * PRESENTATION-ONLY: the edge function is the security boundary
 * (JWT verified inside, subscription lookup scoped by auth.uid).
 * This module owns UX state (opening flag, one-shot error surface) and
 * new-tab handling so all portal entry points behave identically.
 *
 * Portal URLs are one-shot per session; always mint fresh.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PORTAL_UNAVAILABLE_MESSAGE =
  "We couldn't open the billing portal. Please try again in a moment or contact support.";
export const PORTAL_NO_SUBSCRIPTION_MESSAGE =
  "No active paid subscription found on this account.";
export const PORTAL_LIFETIME_ONLY_MESSAGE =
  "Founder Lifetime — one-time purchase, nothing to manage.";

export type OpenPortalErrorCode =
  | "unavailable"
  | "no_subscription"
  | "lifetime_only";

export interface OpenPortalResult {
  ok: boolean;
  error?: string;
  code?: OpenPortalErrorCode;
}

function messageForCode(code: OpenPortalErrorCode): string {
  switch (code) {
    case "no_subscription":
      return PORTAL_NO_SUBSCRIPTION_MESSAGE;
    case "lifetime_only":
      return PORTAL_LIFETIME_ONLY_MESSAGE;
    default:
      return PORTAL_UNAVAILABLE_MESSAGE;
  }
}

/**
 * Fire-and-forget: call the edge function, then window.open the returned
 * URL in a new tab. Paddle's portal cannot be embedded in an iframe.
 */
export async function openPaddleCustomerPortal(): Promise<OpenPortalResult> {
  try {
    const { data, error } = await supabase.functions.invoke<
      { url?: string; error?: string }
    >("paddle-portal-session", { body: {} });
    if (error) {
      // Supabase functions.invoke returns FunctionsHttpError on non-2xx.
      // The response body (with our discriminating `error` code) still rides
      // on error.context; prefer that over a bare HTTP status so lifetime-only
      // accounts get the correct message instead of "no active subscription".
      const ctx = (error as { context?: { status?: number; body?: unknown } })?.context;
      const bodyCode = (() => {
        const body = ctx?.body;
        if (typeof body === "string") {
          try { return (JSON.parse(body) as { error?: string })?.error ?? null; }
          catch { return null; }
        }
        if (body && typeof body === "object") {
          return (body as { error?: string }).error ?? null;
        }
        return null;
      })();
      if (bodyCode === "lifetime_only") {
        return { ok: false, code: "lifetime_only", error: PORTAL_LIFETIME_ONLY_MESSAGE };
      }
      if (bodyCode === "no_subscription" || ctx?.status === 404) {
        return { ok: false, code: "no_subscription", error: PORTAL_NO_SUBSCRIPTION_MESSAGE };
      }
      return { ok: false, code: "unavailable", error: PORTAL_UNAVAILABLE_MESSAGE };
    }
    if (data?.error === "lifetime_only") {
      return { ok: false, code: "lifetime_only", error: PORTAL_LIFETIME_ONLY_MESSAGE };
    }
    if (data?.error === "no_subscription") {
      return { ok: false, code: "no_subscription", error: PORTAL_NO_SUBSCRIPTION_MESSAGE };
    }
    if (!data?.url) return { ok: false, code: "unavailable", error: PORTAL_UNAVAILABLE_MESSAGE };
    // noopener/noreferrer: never let the portal window reach back into the app.
    window.open(data.url, "_blank", "noopener,noreferrer");
    return { ok: true };
  } catch {
    return { ok: false, code: "unavailable", error: PORTAL_UNAVAILABLE_MESSAGE };
  }
}

/** Presentation-only helper for tests + callers that want the map. */
export function portalErrorMessage(code: OpenPortalErrorCode): string {
  return messageForCode(code);
}


/** Small hook to share opening / error state across CTAs on one screen. */
export function useOpenCustomerPortalState() {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    const result = await openPaddleCustomerPortal();
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

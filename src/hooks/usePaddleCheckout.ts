import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  initializePaddle,
  getPaddlePriceId,
  resolvePaddleCheckout,
  getCheckoutUnavailableMessage,
  PaddleCheckoutUnavailableError,
} from "@/lib/paddle";
import { useAuth } from "@/store/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import {
  buildCheckoutPlanReturnPath,
  consumePlanIntent,
  isKnownPlanIntent,
  savePlanIntent,
} from "@/lib/checkoutPlanIntent";
import { beginCheckoutSession } from "@/lib/checkoutOverlaySession";
import { resolvePaidAcquisitionSource } from "@/lib/paidAcquisitionAttributionRules";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";
import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";
import { buildCheckoutCancelPath } from "@/lib/checkoutCancelRecoveryRules";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { saveCheckoutReturnTo } from "@/lib/checkoutReturnToSession";

export interface OpenCheckoutOptions {
  priceId: string;
  quantity?: number;
  successUrl?: string;
}

export interface UsePaddleCheckoutResult {
  openCheckout: (options: OpenCheckoutOptions) => Promise<void>;
  loading: boolean;
  /** The token/host environment decision that also gates checkout. */
  environment: PaddleCheckoutEnvironment;
  /**
   * True when the client-side environment gate has blocked checkout
   * (missing/malformed token, or live token on a loopback host). Derived
   * from the same helper the banner uses, so UI stays consistent.
   */
  unavailable: boolean;
  /**
   * Human-readable blocking copy for the current unavailable case, or
   * `null` when checkout is available. Never contains token values.
   */
  unavailableMessage: string | null;
  /**
   * Set when checkout cannot open, including unavailable environments,
   * resolver/network failures, and Paddle initialization errors. Callers can
   * render an inline recovery path instead of losing the paid intent. Cleared
   * by `dismissBlocked()`.
   */
  blockedReason: string | null;
  dismissBlocked: () => void;
}

export const CHECKOUT_RECOVERY_MESSAGE =
  "Checkout couldn't open. You can leave your email for one availability notice instead.";

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
 *  - Fails closed via `resolvePaddleCheckout()` before any Paddle call
 *    when the environment is `"unavailable"` (Slice A). The caller sees a
 *    calm `blockedReason` string; no navigation, no toast, no crash.
 *  - If the user is not signed in, redirects to /auth with a return-to
 *    parameter so we never open a checkout that cannot be attributed
 *    to a user via `customData.userId`.
 *  - `customData.userId` is required so the Paddle webhook can attribute
 *    the subscription to the correct user (see paddle-checkout knowledge).
 *  - This hook does NOT grant entitlements. Backend webhook + Phase 2
 *    entitlement bridge do that.
 */
export function usePaddleCheckout(): UsePaddleCheckoutResult {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  // Track mount state so the Paddle `checkout.closed` cancel handler (which
  // fires asynchronously from Paddle.js after the modal actually closes)
  // does not navigate a component that has already unmounted. StrictMode-safe.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Derived at every render so a hot-reload / rerender after the token
  // becomes available flips `unavailable` back to false without needing
  // to remount. Cheap — pure string/hostname checks.
  const environment = useMemo(
    () => resolvePaddleCheckout(),
    // resolvePaddleCheckout reads module-scope + window.location.hostname;
    // both are stable across renders in production. This memo is a
    // per-render read, not a subscription — that is intentional.

    [],
  );
  const unavailable = environment === "unavailable";
  const unavailableMessage = useMemo(
    () => (unavailable ? getCheckoutUnavailableMessage() : null),
    [unavailable],
  );

  const dismissBlocked = useCallback(() => setBlockedReason(null), []);

  const openCheckout = useCallback(
    async (options: OpenCheckoutOptions) => {
      // Fail-closed gate BEFORE any auth redirect: if checkout cannot run
      // here, we must not detour the user to /auth and then dead-end.
      const env = resolvePaddleCheckout();
      if (env === "unavailable") {
        setBlockedReason(getCheckoutUnavailableMessage());
        return;
      }

      if (!user) {
        // Persist plan intent so we can auto-resume post-auth ONCE.
        // Allowlist-checked inside savePlanIntent — unknown ids are dropped.
        if (isKnownPlanIntent(options.priceId)) {
          savePlanIntent(options.priceId);
        }
        const back = buildCheckoutPlanReturnPath({
          pathname: location.pathname,
          search: location.search,
          plan: options.priceId,
        });
        navigate(
          buildAttributedSignupPath({
            source: resolvePaidAcquisitionSource(window.location.search) ?? "pricing_page",
            redirectTo: back,
          }),
        );
        return;
      }

      setLoading(true);
      setBlockedReason(null);
      // Funnel ping: an authenticated grower initiated checkout. Fires
      // before price resolution on purpose — a blocked or sold-out
      // resolution is exactly the drop-off the funnel needs to see.
      // options.priceId is a plan slug (allowlist-checked), never input.
      trackFunnelEvent("checkout_started", { plan: options.priceId });
      try {
        await initializePaddle();
        const paddlePriceId = await getPaddlePriceId(options.priceId);

        // L5 (audit fix): persist the sanitized returnTo BEFORE opening the
        // overlay so the cancel path (/checkout/cancel) can restore the
        // buyer to the gated surface they came from. Consumed one-shot on
        // the cancel page. Success path still uses the successUrl query
        // param; both branches call sanitizeCheckoutReturnTo.
        saveCheckoutReturnTo(new URLSearchParams(window.location.search).get("returnTo"));

        // Slice D: register overlay session BEFORE calling
        // Paddle.Checkout.open so the module-level eventCallback (set at
        // Initialize) always has a target when checkout.completed /
        // checkout.closed fire.
        const cancelPath = buildCheckoutCancelPath({
          planId: options.priceId,
          returnTo: new URLSearchParams(location.search).get("returnTo"),
        });
        beginCheckoutSession(() => {
          if (!mountedRef.current) return;
          navigate(cancelPath);
        });
        (window as any).Paddle.Checkout.open({
          items: [{ priceId: paddlePriceId, quantity: options.quantity ?? 1 }],
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
        // The dedicated fail-closed error surfaces as an inline calm state,
        // never a destructive toast. Everything else keeps the existing
        // destructive toast so real Paddle/network failures stay visible.
        if (err instanceof PaddleCheckoutUnavailableError) {
          setBlockedReason(err.message);
        } else {
          setBlockedReason(CHECKOUT_RECOVERY_MESSAGE);
          toast({
            title: "Checkout unavailable",
            description: err instanceof Error ? err.message : "Please try again in a moment.",
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [location.pathname, location.search, navigate, user],
  );

  // Slice C: auto-resume a pending plan intent EXACTLY ONCE after auth.
  // Guarded with a ref so React StrictMode's double-invoke, rerenders, and
  // rapid re-mounts cannot re-open the overlay. `consumePlanIntent` is
  // itself destructive (read + delete), so the storage-side guarantee is
  // one-shot even if the ref were bypassed.
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    if (!user) return;
    if (unavailable) return;
    const pending = consumePlanIntent();
    if (!pending) return;
    resumeAttemptedRef.current = true;
    void openCheckout({ priceId: pending });
  }, [user, unavailable, openCheckout]);

  return {
    openCheckout,
    loading,
    environment,
    unavailable,
    unavailableMessage,
    blockedReason,
    dismissBlocked,
  };
}

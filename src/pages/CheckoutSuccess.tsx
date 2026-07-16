import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import AccountPlanBadge from "@/components/AccountPlanBadge";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import { buildCheckoutActivationViewModel } from "@/lib/checkoutActivationRules";
import {
  clearCheckoutStarted,
  hasFreshCheckoutContext,
  resolveCheckoutSuccessView,
} from "@/lib/checkoutContextRules";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { CheckCircle2, Info, Loader2 } from "lucide-react";

/**
 * Success landing shown after Lovable built-in Paddle checkout completes.
 *
 * SAFETY (Phase 2b truth copy):
 *  - Entitlement is resolved server-side via the union resolver. This page
 *    only reflects that resolution — it does NOT grant entitlements.
 *  - Three distinct states, never claiming completion unverified:
 *      "confirming" — real checkout context on this device (fresh marker
 *                     from checkoutContextRules, or a sanitized returnTo);
 *                     polls the resolver up to ~30 s.
 *      "no_context" — direct visit with nothing to confirm; calm copy, no
 *                     completion claim. Still runs the same quiet bounded
 *                     poll so a storage-blocked buyer (no marker, no
 *                     returnTo) upgrades to confirmed when the webhook
 *                     lands.
 *      "confirmed"  — resolver confirmed an active paid plan.
 *  - "Verdant Pro is active." is shown ONLY after `isActive` is true and
 *    `effectivePlanId !== 'free'`.
 */

// L4 (audit fix): extended the bounded poll window from ~10s to ~30s. Paddle
// webhook delivery + our own event → subscriptions upsert commonly settles
// under 5s but can spike past 10s under load; a 30s ceiling gives real
// customers a "confirming…" state that actually confirms without asking
// them to manually refresh. Interval stays at 1.5s to keep the network
// footprint small (≤20 refetches over the whole window).
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

export default function CheckoutSuccess() {
  const { loading, entitlement, refetch } = useMyEntitlements();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const confirmed = !loading && entitlement.isActive && entitlement.effectivePlanId !== "free";

  // Sanitize the returnTo query param. Never trust the raw value: only
  // same-origin absolute app paths are allowed (see checkoutReturnTo).
  const safeReturnTo = useMemo(
    () => sanitizeCheckoutReturnTo(searchParams.get("returnTo")),
    [searchParams],
  );
  const activation = useMemo(
    () => buildCheckoutActivationViewModel(searchParams.get("returnTo")),
    [searchParams],
  );

  // Same-device checkout context, read once on mount. Distinguishes a real
  // post-checkout return ("confirming…") from a direct visit ("no checkout
  // context") — the page never claims a completed checkout without evidence.
  const [hasCheckoutContext] = useState(() => hasFreshCheckoutContext(Date.now()));
  const view = resolveCheckoutSuccessView({
    confirmed,
    hasReturnTo: safeReturnTo !== null,
    hasCheckoutContext,
  });

  // Once the resolver confirms, the marker has served its purpose.
  useEffect(() => {
    if (confirmed) clearCheckoutStarted();
  }, [confirmed]);

  usePageSeo({
    title:
      view === "confirmed"
        ? "Verdant Pro is active | Verdant Grow Diary"
        : view === "confirming"
          ? "Confirming your Verdant Pro access | Verdant Grow Diary"
          : "Checkout status | Verdant Grow Diary",
    description: "Verdant Pro access is confirmed server-side by the billing webhook.",
    path: "/checkout/success",
  });

  // Funnel ping once per mount, only after the server-side resolver has
  // actually confirmed the active paid plan — this page never self-grants,
  // and the analytics event holds itself to the same standard.
  const activationTrackedRef = useRef(false);
  useEffect(() => {
    if (!confirmed || activationTrackedRef.current) return;
    activationTrackedRef.current = true;
    trackFunnelEvent("subscription_activated", {
      plan: entitlement.effectivePlanId,
    });
  }, [confirmed, entitlement.effectivePlanId]);

  // Bounded poll — stops when confirmed or after POLL_TIMEOUT_MS. Runs in
  // BOTH unconfirmed states: "confirming" shows it explicitly, while
  // "no_context" polls quietly — a real buyer whose sessionStorage is
  // blocked (private mode) and whose success URL carries no returnTo would
  // otherwise land in no_context with no way to detect the webhook landing.
  // The poll only ever upgrades the view via the server-side resolver; the
  // copy never claims completion from the visit itself.
  const startedAt = useRef<number>(Date.now());
  const [pollExhausted, setPollExhausted] = useState(false);

  useEffect(() => {
    if (view === "confirmed") return;
    const id = setInterval(() => {
      if (Date.now() - startedAt.current >= POLL_TIMEOUT_MS) {
        setPollExhausted(true);
        clearInterval(id);
        return;
      }
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [view, refetch]);

  // Auto-redirect to the sanitized returnTo path ONLY after entitlement has
  // confirmed active Pro. Waiting on `confirmed` prevents flicker back into
  // the upgrade gate on a gated Pheno route. If returnTo is missing or
  // unsafe, we stay on this page (existing behavior).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!confirmed) return;
    if (!safeReturnTo) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    navigate(safeReturnTo, { replace: true });
  }, [confirmed, safeReturnTo, navigate]);

  return (
    <main
      className="min-h-screen bg-background text-foreground flex flex-col"
      data-testid="checkout-success-page"
      data-confirmed={confirmed ? "true" : "false"}
      data-view={view}
    >
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
      </header>
      <section className="flex-1 px-6 py-14 max-w-2xl mx-auto text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          {view === "confirmed" ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : view === "confirming" || loading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <Info className="h-8 w-8" />
          )}
        </div>

        {view === "confirmed" ? (
          <>
            <h1
              className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight"
              data-testid="checkout-success-confirmed-heading"
            >
              Verdant Pro is active.
            </h1>
            <p className="mt-4 text-muted-foreground">
              Thanks for backing Verdant. Your grow memory system is ready.
            </p>
            <div className="mt-4 flex justify-center">
              <AccountPlanBadge entitlement={entitlement} />
            </div>
            {!safeReturnTo && (
              <div
                className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-5 text-left"
                data-testid="checkout-success-activation-handoff"
              >
                <h2 className="text-lg font-semibold">{activation.heading}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{activation.description}</p>
                <ol className="mt-4 space-y-2 text-sm">
                  {activation.steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-2">
                      <span className="font-semibold text-primary">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        ) : view === "confirming" ? (
          <>
            <h1
              className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight"
              data-testid="checkout-success-pending-heading"
            >
              Confirming your checkout…
            </h1>
            <p className="mt-4 text-muted-foreground">
              We're confirming your Verdant Pro access with the payment provider. This usually takes
              a few seconds while the billing webhook is processed.
            </p>
            {pollExhausted && (
              <p
                className="mt-3 text-sm text-muted-foreground"
                data-testid="checkout-success-poll-exhausted"
              >
                Still working on it — tap Check status to refresh, or head to Settings to see your
                plan.
              </p>
            )}
          </>
        ) : (
          <>
            <h1
              className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight"
              data-testid="checkout-success-no-context-heading"
            >
              {loading ? "Checking your plan status…" : "No recent checkout found."}
            </h1>
            <p className="mt-4 text-muted-foreground">
              This page confirms a purchase right after checkout. We couldn't find a checkout in
              progress on this device, so there's nothing to confirm here.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              If you did just upgrade, your access is confirmed by the payment provider — tap Check
              status, or open Settings to see your current plan.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {view !== "confirmed" && (
            <Button
              size="lg"
              onClick={() => {
                startedAt.current = Date.now();
                setPollExhausted(false);
                void refetch();
              }}
              data-testid="checkout-success-refresh-button"
            >
              Check status
            </Button>
          )}
          {view === "no_context" ? (
            <Link to="/pricing" data-testid="checkout-success-pricing-link">
              <Button size="lg" variant="outline">
                See plans & pricing
              </Button>
            </Link>
          ) : (
            <Link
              to={confirmed ? activation.primaryHref : (safeReturnTo ?? "/")}
              data-testid="checkout-success-primary-link"
            >
              <Button size="lg" variant={confirmed ? "default" : "outline"}>
                {confirmed ? activation.primaryLabel : safeReturnTo ? "Continue" : "Go to my grow"}
              </Button>
            </Link>
          )}
          <Link to="/settings">
            <Button size="lg" variant="outline">
              Manage account
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}

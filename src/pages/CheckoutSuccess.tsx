import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import AccountPlanBadge from "@/components/AccountPlanBadge";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import { buildCheckoutActivationViewModel } from "@/lib/checkoutActivationRules";
import { CheckCircle2, Loader2 } from "lucide-react";

/**
 * Success landing shown after Lovable built-in Paddle checkout completes.
 *
 * SAFETY (Phase 2b truth copy):
 *  - Entitlement is resolved server-side via the union resolver. This page
 *    only reflects that resolution — it does NOT grant entitlements.
 *  - Until the resolver confirms an active paid plan, the page shows a
 *    "confirming your access" state and polls the hook up to ~10 s.
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

  usePageSeo({
    title: confirmed
      ? "Verdant Pro is active | Verdant Grow Diary"
      : "Confirming your Verdant Pro access | Verdant Grow Diary",
    description: "Your Verdant Pro purchase is being confirmed by the billing webhook.",
    path: "/checkout/success",
  });

  // Bounded poll — stops when confirmed or after POLL_TIMEOUT_MS.
  const startedAt = useRef<number>(Date.now());
  const [pollExhausted, setPollExhausted] = useState(false);

  useEffect(() => {
    if (confirmed) return;
    const id = setInterval(() => {
      if (Date.now() - startedAt.current >= POLL_TIMEOUT_MS) {
        setPollExhausted(true);
        clearInterval(id);
        return;
      }
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [confirmed, refetch]);

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
    >
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
      </header>
      <section className="flex-1 px-6 py-14 max-w-2xl mx-auto text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          {confirmed ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin" />
          )}
        </div>

        {confirmed ? (
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
        ) : (
          <>
            <h1
              className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight"
              data-testid="checkout-success-pending-heading"
            >
              Checkout completed.
            </h1>
            <p className="mt-4 text-muted-foreground">
              We're confirming your Verdant Pro access. This usually takes a few seconds while the
              billing webhook is processed.
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
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {!confirmed && (
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
          <Link
            to={confirmed ? activation.primaryHref : (safeReturnTo ?? "/")}
            data-testid="checkout-success-primary-link"
          >
            <Button size="lg" variant={confirmed ? "default" : "outline"}>
              {confirmed ? activation.primaryLabel : safeReturnTo ? "Continue" : "Go to my grow"}
            </Button>
          </Link>
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

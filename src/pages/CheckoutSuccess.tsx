import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import AccountPlanBadge from "@/components/AccountPlanBadge";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
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

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 10_000;

export default function CheckoutSuccess() {
  const { loading, entitlement, refetch } = useMyEntitlements();

  const confirmed =
    !loading && entitlement.isActive && entitlement.effectivePlanId !== "free";

  usePageSeo({
    title: confirmed
      ? "Verdant Pro is active | Verdant Grow Diary"
      : "Confirming your Verdant Pro access | Verdant Grow Diary",
    description:
      "Your Verdant Pro purchase is being confirmed by the billing webhook.",
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
              We're confirming your Verdant Pro access. This usually takes a few
              seconds while the billing webhook is processed.
            </p>
            {pollExhausted && (
              <p
                className="mt-3 text-sm text-muted-foreground"
                data-testid="checkout-success-poll-exhausted"
              >
                Still working on it — tap Check status to refresh, or head to
                Settings to see your plan.
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
          <Link to="/">
            <Button size="lg" variant={confirmed ? "default" : "outline"}>
              Go to my grow
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

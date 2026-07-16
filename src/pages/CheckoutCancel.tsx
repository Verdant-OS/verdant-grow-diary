import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { XCircle } from "lucide-react";
import { resolveCheckoutCancelRecovery } from "@/lib/checkoutCancelRecoveryRules";
import { trackPricingEvent } from "@/lib/pricingAnalytics";
import { consumeCheckoutReturnTo } from "@/lib/checkoutReturnToSession";

/**
 * Cancel / not-completed landing.
 *
 * Reached when the Paddle overlay is dismissed without completing or
 * when the checkout URL is opened directly. Copy is calm — no fake
 * urgency, no re-prompt aggression.
 *
 * L5 (audit fix): consume the sanitized return-to that
 * usePaddleCheckout persisted before opening the overlay, and offer it
 * as the primary "Go back" target so a buyer who cancelled from a gated
 * surface (e.g. /pheno-hunts/new) can return there in one click instead
 * of being dropped on generic /pricing.
 */
export default function CheckoutCancel() {
  const [searchParams] = useSearchParams();
  const recovery = resolveCheckoutCancelRecovery(searchParams);

  usePageSeo({
    title: "Checkout not completed | Verdant Grow Diary",
    description: "No charge was made. You can try again anytime.",
    path: "/checkout/cancel",
  });

  useEffect(() => {
    trackPricingEvent("checkout_cancel_page_view", {
      plan: recovery.planId ?? "unknown",
    });
  }, [recovery.planId]);

  const [safeReturnTo, setSafeReturnTo] = useState<string | null>(null);

  // Consume once on mount. useMemo would swallow StrictMode double-invoke
  // but useEffect is the correct one-shot boundary here.
  useEffect(() => {
    setSafeReturnTo(consumeCheckoutReturnTo());
  }, []);

  const returnLabel = useMemo(() => {
    if (!safeReturnTo) return null;
    if (safeReturnTo.startsWith("/pheno")) return "Back to Pheno Hunt";
    return "Back to where you were";
  }, [safeReturnTo]);

  return (
    <main
      className="min-h-screen bg-background text-foreground flex flex-col"
      data-testid="checkout-cancel-page"
      data-return-to={safeReturnTo ?? ""}
    >
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
      </header>
      <section className="flex-1 px-6 py-14 max-w-2xl mx-auto text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
          <XCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight">
          Checkout was not completed. No charge was made.
        </h1>
        <p className="mt-4 text-muted-foreground">
          {recovery.planLabel
            ? `Your ${recovery.planLabel} choice is still selected if you want to review it again. `
            : "You can head back to pricing whenever you're ready. "}
          Your grow diary stays on the Free tier until you complete a purchase.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {safeReturnTo && returnLabel && (
            <Link
              to={safeReturnTo}
              data-testid="checkout-cancel-return-to"
              onClick={() =>
                trackPricingEvent("checkout_cancel_return_clicked", {
                  plan: recovery.planId ?? "unknown",
                })
              }
            >
              <Button size="lg">{returnLabel}</Button>
            </Link>
          )}
          <Link
            to={recovery.pricingPath}
            data-testid="checkout-cancel-pricing-link"
            onClick={() =>
              trackPricingEvent("checkout_cancel_pricing_clicked", {
                plan: recovery.planId ?? "unknown",
              })
            }
          >
            <Button size="lg" variant={safeReturnTo ? "outline" : "default"}>
              {recovery.planLabel ? `Review ${recovery.planLabel} again` : "Back to pricing"}
            </Button>
          </Link>
          {safeReturnTo !== recovery.returnPath && (
            <Link
              to={recovery.returnPath}
              data-testid="checkout-cancel-return-link"
              onClick={() =>
                trackPricingEvent("checkout_cancel_return_clicked", {
                  plan: recovery.planId ?? "unknown",
                })
              }
            >
              <Button size="lg" variant="outline">
                {recovery.returnLabel}
              </Button>
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

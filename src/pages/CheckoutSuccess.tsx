import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { CheckCircle2 } from "lucide-react";

/**
 * Success landing shown after Paddle test/live checkout completes.
 *
 * SAFETY:
 *  - This page does NOT grant entitlements. Entitlement resolution
 *    happens server-side once the Paddle webhook writes the
 *    subscription row (Phase 2). The copy below reflects the intent
 *    of the purchase, not a client-side grant.
 */
export default function CheckoutSuccess() {
  usePageSeo({
    title: "Verdant Pro is active | Verdant Grow Diary",
    description:
      "Thanks for supporting Verdant. Your grow memory system is ready.",
    path: "/checkout/success",
  });

  return (
    <main
      className="min-h-screen bg-background text-foreground flex flex-col"
      data-testid="checkout-success-page"
    >
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
      </header>
      <section className="flex-1 px-6 py-14 max-w-2xl mx-auto text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight">
          Verdant Pro is active.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Thanks for backing Verdant. It may take a moment for your access to
          show up across every surface — refresh if a Pro feature still shows
          the free-tier limit.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/">
            <Button size="lg">Go to my grow</Button>
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

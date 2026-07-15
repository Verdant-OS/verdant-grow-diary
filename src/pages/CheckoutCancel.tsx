import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { XCircle } from "lucide-react";

/**
 * Cancel / not-completed landing.
 *
 * Reached when the Paddle overlay is dismissed without completing or
 * when the checkout URL is opened directly. Copy is calm — no fake
 * urgency, no re-prompt aggression.
 */
export default function CheckoutCancel() {
  usePageSeo({
    title: "Checkout not completed | Verdant Grow Diary",
    description: "No charge was made. You can try again anytime.",
    path: "/checkout/cancel",
  });

  return (
    <main
      className="min-h-screen bg-background text-foreground flex flex-col"
      data-testid="checkout-cancel-page"
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
          You can head back to pricing whenever you're ready. Your grow
          diary stays on the Free tier until you complete a purchase.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/pricing">
            <Button size="lg">Back to pricing</Button>
          </Link>
          <Link to="/">
            <Button size="lg" variant="outline">
              Go to my grow
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}

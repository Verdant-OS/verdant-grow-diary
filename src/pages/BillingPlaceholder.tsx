import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";

/**
 * Placeholder billing route for Phase 2 pricing.
 *
 * Checkout is not yet wired. This page only confirms which plan the user
 * intended to buy and points them back to pricing. No payment, no charge,
 * no PII capture beyond what the public site already collects.
 */

const PLANS: Record<string, { name: string; price: string; cadence: string; blurb: string }> = {
  "pro-monthly": {
    name: "Verdant Pro — Monthly",
    price: "$12",
    cadence: "/ month",
    blurb: "Cloud sync, multi-tent support, deeper grow history, and priority support.",
  },
  "pro-annual": {
    name: "Verdant Pro — Annual",
    price: "$115",
    cadence: "/ year",
    blurb: "All of Pro, billed once a year.",
  },
  "founder-lifetime": {
    name: "Founder Lifetime Deal",
    price: "$129",
    cadence: "one-time",
    blurb: "Pro features for the life of the product. Limited to the first 75 buyers.",
  },
};

export default function BillingPlaceholder() {
  const { plan } = useParams<{ plan: string }>();
  const detail = plan ? PLANS[plan] : undefined;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
        <Link to="/pricing">
          <Button variant="outline" size="sm">Back to pricing</Button>
        </Link>
      </header>

      <section className="px-6 py-16 max-w-2xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          Checkout
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight">
          {detail ? detail.name : "Verdant Pro"}
        </h1>
        {detail && (
          <p className="mt-4 text-2xl font-display">
            {detail.price}{" "}
            <span className="text-base text-muted-foreground">{detail.cadence}</span>
          </p>
        )}
        <p className="mt-4 text-muted-foreground">
          {detail?.blurb ?? "Choose a plan from the pricing page to continue."}
        </p>
        <div className="mt-8 rounded-xl border border-border/60 bg-card/40 p-6 text-left">
          <p className="text-sm text-muted-foreground">
            Checkout is being finalized. No payment is being collected on this
            screen. If you want to be first in line when checkout opens, sign
            in or create an account — we will email you when it goes live.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth">
            <Button size="lg">Create an account</Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline">Back to pricing</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}

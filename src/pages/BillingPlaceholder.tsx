import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import {
  resolvePaddleConfig,
  unavailableMessage,
  type PaddlePlanSlug,
} from "@/lib/paddleConfig";

/**
 * Billing route — SANDBOX ONLY.
 *
 * Verdant is in sandbox/test mode for Paddle. This page:
 *
 *  - shows which plan the user intended to buy
 *  - if Paddle sandbox env vars are present, renders a "Start sandbox
 *    checkout" button that would open the Paddle sandbox overlay (no
 *    live charges, no real money)
 *  - if any sandbox config is missing or the env is "live"/"production",
 *    renders a safe unavailable state
 *  - NEVER grants Pro access from this screen. Entitlements are only
 *    granted server-side after a verified Paddle webhook event.
 *
 * Compliance: Verdant sells software (grow diary, plant memory, sensor
 * snapshots, exports, backups, cautious AI decision support). Verdant
 * does not sell cannabis, seeds, nutrients, or any consumable or
 * regulated product.
 */

const PLANS: Record<
  PaddlePlanSlug,
  { name: string; price: string; cadence: string; blurb: string }
> = {
  "pro-monthly": {
    name: "Verdant Pro — Monthly",
    price: "$12",
    cadence: "/ month",
    blurb:
      "Cloud sync, multi-tent support, deeper grow history, and priority support.",
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
    blurb:
      "Pro features for the life of the product. Limited to the first 75 buyers.",
  },
};

function isKnownPlan(slug: string | undefined): slug is PaddlePlanSlug {
  return slug === "pro-monthly" || slug === "pro-annual" || slug === "founder-lifetime";
}

export default function BillingPlaceholder() {
  const { plan } = useParams<{ plan: string }>();
  const planSlug = isKnownPlan(plan) ? plan : undefined;
  const detail = planSlug ? PLANS[planSlug] : undefined;
  const config = useMemo(() => resolvePaddleConfig(), []);

  const sandboxReady = config.available && planSlug !== undefined;
  const sandboxPriceId =
    config.available && planSlug && config.priceIds
      ? config.priceIds[planSlug]
      : null;
  const unavailableText =
    config.available || !config.reason
      ? "Choose a plan from the pricing page to continue."
      : unavailableMessage(config.reason);




  const handleStartSandboxCheckout = () => {
    // Intentionally a stub. The real Paddle SDK call (`Paddle.Checkout.open`)
    // is intentionally NOT wired here yet because:
    //   1. We are in sandbox-only mode and have not verified live access.
    //   2. Pro entitlement must only flip after a verified webhook event.
    // When wired, this handler must:
    //   - load the Paddle.js sandbox bundle
    //   - call Paddle.Initialize({ environment: "sandbox", token: clientToken })
    //   - call Paddle.Checkout.open({ items: [{ priceId: sandboxPriceId }] })
    // and rely on the paddle-webhook edge function for entitlements.
    if (typeof window !== "undefined" && sandboxPriceId) {
      // eslint-disable-next-line no-console
      console.info(
        "[paddle:sandbox] checkout intent",
        { plan: planSlug, priceId: sandboxPriceId, environment: "sandbox" },
      );
    }
  };

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

        {sandboxReady ? (
          <div
            className="mt-8 rounded-xl border border-primary/40 bg-primary/5 p-6 text-left"
            data-testid="paddle-sandbox-ready"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                Sandbox / test mode
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This is a sandbox checkout. No real payment is processed and no
              money is collected. Pro access is <strong>not</strong> granted
              from this screen — it is only granted after a verified Paddle
              webhook is received and recorded server-side.
            </p>
            <div className="mt-5">
              <Button
                size="lg"
                className="w-full"
                data-testid="paddle-sandbox-checkout-button"
                onClick={handleStartSandboxCheckout}
              >
                Start sandbox checkout
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="mt-8 rounded-xl border border-border/60 bg-card/40 p-6 text-left"
            data-testid="paddle-unavailable"
          >
            <p className="text-sm font-medium">Checkout unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {unavailableText} No payment is being collected on this screen.
            </p>

            <p className="mt-3 text-sm text-muted-foreground">
              If you want to be first in line when checkout opens, sign in or
              create an account — we will email you when it goes live.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth">
            <Button size="lg">Create an account</Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline">Back to pricing</Button>
          </Link>
        </div>

        <p
          className="mt-10 text-xs text-muted-foreground max-w-xl mx-auto"
          data-testid="billing-compliance-note"
        >
          Verdant sells software only — a grow diary, plant memory, sensor
          snapshots, exports, backups, and cautious AI decision support.
          Verdant does not sell cannabis, seeds, nutrients, or any consumable
          or regulated product. Verdant does not control grow-room equipment
          and never makes grow-room changes without your approval.
        </p>
      </section>
    </main>
  );
}

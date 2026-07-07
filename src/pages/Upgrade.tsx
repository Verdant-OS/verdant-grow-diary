/**
 * Upgrade page — presenter-only pricing surface.
 *
 * Reads ALL tier data from `src/config/pricing.ts`. Never hardcodes a price,
 * tier name, or feature string here.
 *
 * Checkout is Paddle sandbox-only via the existing paddleConfig helper. Any
 * tier whose `paddlePriceId` is null is INERT (button disabled, "Available
 * soon" label) — no checkout ever fires against a null price ID.
 *
 * This page does NOT:
 *  - grant entitlements
 *  - write to the database
 *  - enforce the founder cap (server-side responsibility; `claimed` shown here
 *    is display-only)
 *  - expose secrets, service_role, or Paddle API keys
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PRICING_TIERS, type PricingTier } from "@/config/pricing";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import {
  resolvePaddleConfig,
  unavailableMessage,
  type PaddleConfig,
} from "@/lib/paddleConfig";

// --- Paddle overlay typing (loose — we only call a couple of methods). -------
interface PaddleCheckoutOpenPayload {
  items: Array<{ priceId: string; quantity: number }>;
  successCallback?: () => void;
  closeCallback?: () => void;
}
interface PaddleGlobal {
  Environment?: { set: (env: string) => void };
  Initialize?: (opts: {
    token: string;
    eventCallback?: (ev: { name?: string; data?: unknown }) => void;
  }) => void;
  Checkout?: { open: (payload: PaddleCheckoutOpenPayload) => void };
}
declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

function useSoldOut(tier: PricingTier): boolean {
  return !!tier.cap && tier.cap.claimed >= tier.cap.total;
}

/** Load Paddle.js on demand. Returns Paddle global once ready, or null on failure. */
function usePaddle(config: PaddleConfig): {
  ready: boolean;
  loading: boolean;
  error: string | null;
  paddle: PaddleGlobal | null;
} {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.available) return;
    if (window.Paddle?.Checkout) {
      setReady(true);
      return;
    }
    setLoading(true);

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PADDLE_JS_SRC}"]`,
    );

    const init = () => {
      try {
        if (!window.Paddle) throw new Error("Paddle global missing after load");
        window.Paddle.Environment?.set(config.environment ?? "sandbox");
        window.Paddle.Initialize?.({
          token: config.clientToken!,
          eventCallback: (ev) => {
            if (ev?.name === "checkout.error") {
              toast.error("Checkout error. No charge was made.");
            }
          },
        });
        setReady(true);
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to init Paddle");
        setLoading(false);
      }
    };

    if (existing) {
      existing.addEventListener("load", init, { once: true });
      existing.addEventListener(
        "error",
        () => {
          setError("Failed to load Paddle");
          setLoading(false);
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = PADDLE_JS_SRC;
    script.async = true;
    script.onload = init;
    script.onerror = () => {
      setError("Failed to load Paddle");
      setLoading(false);
    };
    document.head.appendChild(script);
  }, [config]);

  return { ready, loading, error, paddle: ready ? window.Paddle ?? null : null };
}

interface TierCardProps {
  tier: PricingTier;
  currentPlanId: string | null;
  currentPlanKnown: boolean;
  paddleReady: boolean;
  paddleUnavailableReason: string | null;
  onCheckout: (tier: PricingTier) => void;
  onFreeStart: () => void;
}

function TierCard({
  tier,
  currentPlanId,
  currentPlanKnown,
  paddleReady,
  paddleUnavailableReason,
  onCheckout,
  onFreeStart,
}: TierCardProps) {
  const soldOut = useSoldOut(tier);
  const priceIdMissing = tier.paddlePriceId === null;
  const isCurrent = currentPlanKnown && currentPlanId === tier.id;

  // Compose CTA state.
  let ctaLabel = "Get started";
  let ctaDisabled = false;
  let ctaHint: string | null = null;
  let onClick: () => void = () => onFreeStart();

  if (tier.billingPeriod === "free") {
    ctaLabel = isCurrent ? "Current plan" : "Get started";
    ctaDisabled = isCurrent;
  } else if (isCurrent) {
    ctaLabel = "Current plan";
    ctaDisabled = true;
  } else if (soldOut) {
    ctaLabel = "Sold out";
    ctaDisabled = true;
  } else if (priceIdMissing) {
    ctaLabel = "Available soon";
    ctaDisabled = true;
    ctaHint = "Checkout is being finalized.";
  } else if (paddleUnavailableReason) {
    ctaLabel = "Available soon";
    ctaDisabled = true;
    ctaHint = paddleUnavailableReason;
  } else if (!paddleReady) {
    ctaLabel = "Preparing checkout…";
    ctaDisabled = true;
  } else {
    ctaLabel = tier.billingPeriod === "lifetime" ? "Claim lifetime" : "Upgrade";
    onClick = () => onCheckout(tier);
  }

  return (
    <Card
      data-testid={`tier-${tier.id}`}
      className={cn(
        "relative flex flex-col bg-card/40 backdrop-blur",
        tier.highlighted ? "border-primary/50 shadow-md" : "border-border/60",
      )}
    >
      {tier.highlighted && (
        <Badge
          className="absolute -top-3 left-1/2 -translate-x-1/2"
          variant="default"
        >
          Most popular
        </Badge>
      )}
      <CardHeader>
        <CardTitle className="font-display text-xl">{tier.name}</CardTitle>
        <CardDescription>
          <span className="text-3xl font-bold text-foreground">
            {tier.priceDisplay}
          </span>{" "}
          <span className="text-sm text-muted-foreground">
            {tier.priceSubtext}
          </span>
        </CardDescription>
        {tier.cap && (
          <p
            className="mt-1 text-xs text-muted-foreground"
            data-testid={`tier-${tier.id}-cap`}
          >
            {tier.cap.claimed} of {tier.cap.total} claimed
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-2 text-sm">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <Button
          type="button"
          onClick={onClick}
          disabled={ctaDisabled}
          data-testid={`tier-${tier.id}-cta`}
          variant={tier.highlighted && !ctaDisabled ? "default" : "secondary"}
        >
          {ctaLabel}
        </Button>
        {ctaHint && (
          <p className="text-xs text-muted-foreground text-center">{ctaHint}</p>
        )}
      </CardFooter>
    </Card>
  );
}

export default function Upgrade() {
  const paddleConfig = useMemo(() => resolvePaddleConfig(), []);
  const paddleUnavailableReason = paddleConfig.available
    ? null
    : unavailableMessage(paddleConfig.reason ?? "missing_environment");

  const { ready: paddleReady, paddle } = usePaddle(paddleConfig);
  const { loading: entLoading, entitlement } = useMyEntitlements();

  // Current plan is "known" only if we're done loading AND we have a display id.
  const currentPlanKnown = !entLoading && !!entitlement?.displayPlanId;
  const currentPlanId = currentPlanKnown
    ? (entitlement.displayPlanId as string)
    : null;

  const handleCheckout = (tier: PricingTier) => {
    // Interlock: never fire checkout against a null price ID.
    if (!tier.paddlePriceId) {
      toast.error("Checkout is not available for this plan yet.");
      return;
    }
    if (!paddleConfig.available || !paddle?.Checkout) {
      toast.error("Checkout is not ready yet.");
      return;
    }
    try {
      paddle.Checkout.open({
        items: [{ priceId: tier.paddlePriceId, quantity: 1 }],
        successCallback: () => {
          toast.success(
            "Checkout complete. Your plan will update once confirmed.",
          );
        },
        closeCallback: () => {
          // Cancel is not an error — quiet dismissal.
        },
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Checkout failed to open.",
      );
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Choose your Verdant plan
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Plant memory, sensor truth, and grower-approved action. Prices shown
          are provisional.
        </p>
        {entLoading && (
          <p
            className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="upgrade-loading"
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Loading your current
            plan…
          </p>
        )}
        {paddleUnavailableReason && (
          <p
            className="mt-3 text-xs text-muted-foreground"
            data-testid="upgrade-paddle-unavailable"
          >
            {paddleUnavailableReason}
          </p>
        )}
      </header>

      <section
        aria-label="Pricing tiers"
        className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4"
      >
        {PRICING_TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            currentPlanId={currentPlanId}
            currentPlanKnown={currentPlanKnown}
            paddleReady={paddleReady}
            paddleUnavailableReason={paddleUnavailableReason}
            onCheckout={handleCheckout}
            onFreeStart={() => {
              // Free tier is an app-entry action, never a Paddle checkout.
              // Navigate via a real link for a11y in the footer note below.
            }}
          />
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        New to Verdant?{" "}
        <Link to="/auth" className="underline underline-offset-4">
          Create a free account
        </Link>
        .
      </p>
    </main>
  );
}

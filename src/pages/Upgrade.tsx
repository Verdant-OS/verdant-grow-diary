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
 *  - open Paddle without an explicit user confirmation
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

import {
  PRICING_TIERS,
  PLAN_COMPARISON,
  UPGRADE_FAQ,
  type PricingTier,
} from "@/config/pricing";
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

/**
 * Load Paddle.js on demand. Returns Paddle global once ready, or null on
 * failure. `retry()` bumps an attempt counter to re-run initialization; it
 * never opens checkout by itself.
 */
function usePaddle(config: PaddleConfig): {
  ready: boolean;
  loading: boolean;
  error: string | null;
  paddle: PaddleGlobal | null;
  retry: () => void;
} {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!config.available) {
      setReady(false);
      setLoading(false);
      return;
    }
    setError(null);
    if (window.Paddle?.Checkout) {
      setReady(true);
      setLoading(false);
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
  }, [config, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setReady(false);
    setAttempt((a) => a + 1);
  }, []);

  return {
    ready,
    loading,
    error,
    paddle: ready ? window.Paddle ?? null : null,
    retry,
  };
}

// ---------- Status banner ---------------------------------------------------

interface StatusBannerProps {
  configAvailable: boolean;
  unavailableReason: string | null;
  loading: boolean;
  error: string | null;
  ready: boolean;
  onRetry: () => void;
}

function CheckoutStatusBanner({
  configAvailable,
  unavailableReason,
  loading,
  error,
  ready,
  onRetry,
}: StatusBannerProps) {
  // Ready and no error → no noisy banner.
  if (ready && !error && configAvailable) return null;

  let variant: "info" | "warn" | "error" = "info";
  let title = "";
  let body = "";
  let showRetry = false;

  if (!configAvailable) {
    variant = "warn";
    title = "Checkout unavailable";
    body =
      unavailableReason ??
      "Checkout is temporarily unavailable. You can still start free while paid checkout is being prepared.";
  } else if (error) {
    variant = "error";
    title = "Checkout is temporarily unavailable.";
    body =
      "We couldn't initialize the payment overlay. You can still start free while paid checkout is being prepared.";
    showRetry = true;
  } else if (loading) {
    variant = "info";
    title = "Preparing checkout…";
    body = "Loading the payment overlay. This only takes a moment.";
  } else {
    return null;
  }

  return (
    <div
      role={variant === "info" ? "status" : "alert"}
      aria-live={variant === "info" ? "polite" : "assertive"}
      data-testid="checkout-status-banner"
      data-variant={variant}
      className={cn(
        "mt-6 rounded-lg border p-4 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
        variant === "info" &&
          "border-border/60 bg-muted/40 text-muted-foreground",
        variant === "warn" &&
          "border-amber-500/40 bg-amber-500/5 text-foreground",
        variant === "error" &&
          "border-destructive/50 bg-destructive/5 text-foreground",
      )}
    >
      <div className="flex items-start gap-2">
        {loading && (
          <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
        </div>
      </div>
      {showRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          data-testid="checkout-status-retry"
        >
          Retry checkout setup
        </Button>
      )}
    </div>
  );
}

// ---------- Tier card -------------------------------------------------------

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

// ---------- Comparison table ------------------------------------------------

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" />
    ) : (
      <X
        className="mx-auto h-4 w-4 text-muted-foreground/60"
        aria-label="Not included"
      />
    );
  }
  return <span className="text-sm">{value}</span>;
}

function PlanComparisonTable() {
  return (
    <section
      aria-label="Plan comparison"
      className="mt-16"
      data-testid="plan-comparison"
    >
      <h2 className="font-display text-2xl font-semibold text-center">
        Compare plans
      </h2>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-3 text-left font-medium">Feature</th>
              {PRICING_TIERS.map((t) => (
                <th
                  key={t.id}
                  className="p-3 text-center font-medium"
                  data-testid={`compare-header-${t.id}`}
                >
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.map((row, idx) => (
              <tr
                key={row.label}
                className={cn(
                  "border-t border-border/40",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                <td className="p-3 text-left font-medium">{row.label}</td>
                {PRICING_TIERS.map((t) => (
                  <td key={t.id} className="p-3 text-center">
                    <ComparisonCell value={row.values[t.id] ?? false} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- FAQ -------------------------------------------------------------

function UpgradeFaq() {
  return (
    <section
      aria-label="Frequently asked questions"
      className="mt-16"
      data-testid="upgrade-faq"
    >
      <h2 className="font-display text-2xl font-semibold text-center">
        Frequently asked questions
      </h2>
      <Accordion type="single" collapsible className="mt-6 mx-auto max-w-3xl">
        {UPGRADE_FAQ.map((item, i) => (
          <AccordionItem key={item.q} value={`faq-${i}`}>
            <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

// ---------- Confirmation dialog --------------------------------------------

interface ConfirmState {
  tier: PricingTier;
}

interface ConfirmDialogProps {
  state: ConfirmState | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function billingPeriodLabel(p: PricingTier["billingPeriod"]): string {
  switch (p) {
    case "monthly":
      return "Monthly billing";
    case "annual":
      return "Annual billing";
    case "lifetime":
      return "One-time payment";
    case "free":
    default:
      return "Free";
  }
}

function CheckoutConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const open = state !== null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent data-testid="checkout-confirm-dialog">
        {state && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm your plan</DialogTitle>
              <DialogDescription>
                You'll review payment details in Paddle before purchase. No
                charge is made yet.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border/60 p-4 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{state.tier.name}</span>
                <span className="text-xs text-muted-foreground">
                  {billingPeriodLabel(state.tier.billingPeriod)}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span
                  className="text-2xl font-bold"
                  data-testid="checkout-confirm-price"
                >
                  {state.tier.priceDisplay}
                </span>
                <span className="text-xs text-muted-foreground">
                  {state.tier.priceSubtext}
                </span>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                data-testid="checkout-confirm-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                data-testid="checkout-confirm-continue"
              >
                Continue to checkout
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Page ------------------------------------------------------------

export default function Upgrade() {
  const paddleConfig = useMemo(() => resolvePaddleConfig(), []);
  const navigate = useNavigate();
  const paddleUnavailableReason = paddleConfig.available
    ? null
    : unavailableMessage(paddleConfig.reason ?? "missing_environment");

  const {
    ready: paddleReady,
    loading: paddleLoading,
    error: paddleError,
    paddle,
    retry: retryPaddle,
  } = usePaddle(paddleConfig);
  const { loading: entLoading, entitlement } = useMyEntitlements();

  const currentPlanKnown = !entLoading && !!entitlement?.displayPlanId;
  const currentPlanId = currentPlanKnown
    ? (entitlement.displayPlanId as string)
    : null;

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const openConfirm = (tier: PricingTier) => {
    // Defensive interlock: never surface confirmation for inert CTAs.
    if (!tier.paddlePriceId) return;
    if (!paddleConfig.available || !paddle?.Checkout) return;
    setConfirmState({ tier });
  };

  const handleConfirm = () => {
    const tier = confirmState?.tier;
    setConfirmState(null);
    if (!tier) return;
    // Re-check interlocks at the moment of firing checkout.
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
        closeCallback: () => {},
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
      </header>

      <CheckoutStatusBanner
        configAvailable={paddleConfig.available}
        unavailableReason={paddleUnavailableReason}
        loading={paddleLoading}
        error={paddleError}
        ready={paddleReady}
        onRetry={retryPaddle}
      />

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
            onCheckout={openConfirm}
            onFreeStart={() => navigate("/auth")}
          />
        ))}
      </section>

      <PlanComparisonTable />

      <UpgradeFaq />

      <p className="mt-12 text-center text-xs text-muted-foreground">
        New to Verdant?{" "}
        <Link to="/auth" className="underline underline-offset-4">
          Create a free account
        </Link>
        .
      </p>

      <CheckoutConfirmDialog
        state={confirmState}
        onCancel={() => setConfirmState(null)}
        onConfirm={handleConfirm}
      />
    </main>
  );
}

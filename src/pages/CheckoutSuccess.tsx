import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import AccountPlanBadge from "@/components/AccountPlanBadge";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { sanitizeCheckoutReturnTo } from "@/lib/checkoutReturnTo";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Success landing shown after Lovable built-in Paddle checkout completes.
 *
 * SAFETY (Phase 2b truth copy):
 *  - Entitlement is resolved server-side via the union resolver. This page
 *    only reflects that resolution — it does NOT grant entitlements.
 *  - Until the resolver confirms an active paid plan, the page shows a
 *    "confirming your access" state and polls the hook up to ~30 s.
 *  - "Verdant Pro is active." is shown ONLY after `isActive` is true and
 *    `effectivePlanId !== 'free'`.
 *  - Parallel fallback: polls the `checkout-status` edge function (read-only,
 *    JWT-verified) to detect the case where the webhook DID land but the
 *    processor returned `failed`. In that case we surface a clear
 *    "payment received, processing failed — contact support" state instead
 *    of only relying on the poll timing out.
 *  - The entitlements resolver remains the PRIMARY success signal. The
 *    checkout-status probe is a fallback failure detector; it never grants
 *    or confirms Pro access on its own.
 */

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;
// Space failure-detector calls further apart than entitlement refetch so we
// don't hammer the edge function once per 1.5 s tick.
const STATUS_PROBE_EVERY_MS = 4_500;

type FailureState =
  | { kind: "none" }
  | { kind: "failed"; eventType: string | null; receivedAt: string | null };

export default function CheckoutSuccess() {
  const { loading, entitlement, refetch } = useMyEntitlements();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const confirmed =
    !loading && entitlement.isActive && entitlement.effectivePlanId !== "free";

  // Sanitize the returnTo query param. Never trust the raw value: only
  // same-origin absolute app paths are allowed (see checkoutReturnTo).
  const safeReturnTo = useMemo(
    () => sanitizeCheckoutReturnTo(searchParams.get("returnTo")),
    [searchParams],
  );

  usePageSeo({
    title: confirmed
      ? "Verdant Pro is active | Verdant Grow Diary"
      : "Confirming your Verdant Pro access | Verdant Grow Diary",
    description:
      "Your Verdant Pro purchase is being confirmed by the billing webhook.",
    path: "/checkout/success",
  });

  // Bounded poll — stops when confirmed, when webhook is known-failed, or
  // after POLL_TIMEOUT_MS.
  const startedAt = useRef<number>(Date.now());
  const [pollExhausted, setPollExhausted] = useState(false);
  const [failure, setFailure] = useState<FailureState>({ kind: "none" });

  const probeStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "checkout-status",
        { body: {} },
      );
      if (error || !data || (data as { ok?: boolean }).ok !== true) return;
      const d = data as {
        ok: true;
        hasFailed: boolean;
        eventType?: string | null;
        receivedAt?: string | null;
      };
      if (d.hasFailed) {
        setFailure({
          kind: "failed",
          eventType: d.eventType ?? null,
          receivedAt: d.receivedAt ?? null,
        });
      }
    } catch {
      // Failure detector is best-effort; entitlement poll is the primary
      // signal. Swallow network errors silently.
    }
  }, []);

  useEffect(() => {
    if (confirmed) return;
    if (failure.kind === "failed") return;
    const lastProbeAt = { t: 0 };
    const id = setInterval(() => {
      if (Date.now() - startedAt.current >= POLL_TIMEOUT_MS) {
        setPollExhausted(true);
        clearInterval(id);
        // One final probe on timeout so a "failed" state can still surface
        // instead of the ambiguous "still working on it" copy.
        void probeStatus();
        return;
      }
      void refetch();
      if (Date.now() - lastProbeAt.t >= STATUS_PROBE_EVERY_MS) {
        lastProbeAt.t = Date.now();
        void probeStatus();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [confirmed, failure.kind, refetch, probeStatus]);

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

  const isFailed = failure.kind === "failed" && !confirmed;

  return (
    <main
      className="min-h-screen bg-background text-foreground flex flex-col"
      data-testid="checkout-success-page"
      data-confirmed={confirmed ? "true" : "false"}
      data-webhook-failed={isFailed ? "true" : "false"}
    >
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <BrandLogo size="md" showText />
        </Link>
      </header>
      <section className="flex-1 px-6 py-14 max-w-2xl mx-auto text-center">
        <div
          className={
            "mx-auto h-14 w-14 rounded-full flex items-center justify-center " +
            (isFailed
              ? "bg-destructive/15 text-destructive"
              : "bg-primary/15 text-primary")
          }
        >
          {confirmed ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : isFailed ? (
            <AlertTriangle className="h-8 w-8" />
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
        ) : isFailed ? (
          <>
            <h1
              className="mt-6 font-display text-3xl md:text-4xl font-bold tracking-tight"
              data-testid="checkout-success-failed-heading"
            >
              Payment received — activation needs support.
            </h1>
            <p
              className="mt-4 text-muted-foreground"
              data-testid="checkout-success-failed-body"
            >
              Your payment was received, but our billing webhook could not
              finish activating your plan automatically. No further charge is
              needed. Please contact support and we'll finish activation
              manually — your payment is safe.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Reference: {failure.kind === "failed" ? failure.eventType ?? "webhook" : "webhook"}
              {failure.kind === "failed" && failure.receivedAt
                ? ` at ${failure.receivedAt}`
                : ""}
            </p>
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
          {!confirmed && !isFailed && (
            <Button
              size="lg"
              onClick={() => {
                startedAt.current = Date.now();
                setPollExhausted(false);
                void refetch();
                void probeStatus();
              }}
              data-testid="checkout-success-refresh-button"
            >
              Check status
            </Button>
          )}
          {isFailed && (
            <a
              href="mailto:support@verdantgrowdiary.com?subject=Checkout%20activation%20needs%20help"
              data-testid="checkout-success-support-link"
            >
              <Button size="lg">Contact support</Button>
            </a>
          )}
          <Link to={safeReturnTo ?? "/"} data-testid="checkout-success-primary-link">
            <Button size="lg" variant={confirmed ? "default" : "outline"}>
              {safeReturnTo ? "Continue" : "Go to my grow"}
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

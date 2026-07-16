/**
 * SubscriptionPastDueBanner — presenter-only.
 *
 * Shown at the top of the authenticated app shell when the caller's
 * resolved subscription is in a `past_due` state (Paddle is retrying the
 * card). Links to the customer portal so the grower can update their
 * payment method before Paddle exhausts retries and cancels.
 *
 * SECURITY: this hook read is presentation-only. It never grants or
 * revokes entitlement. Paddle's own dunning flow decides when the
 * subscription transitions to canceled.
 */
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { openPaddleCustomerPortal, useOpenCustomerPortalState } from "@/lib/customerPortal";
import { AlertTriangle } from "lucide-react";

export function SubscriptionPastDueBanner() {
  const { loading, entitlement } = useMyEntitlements();
  const { opening, error, open, clearError } = useOpenCustomerPortalState();

  if (loading) return null;
  if (entitlement?.status !== "past_due") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="subscription-past-due-banner"
      className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900"
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Your last payment didn't go through. Update your payment method to
          keep Pro access — we'll retry automatically.
        </span>
        <button
          type="button"
          onClick={() => {
            clearError();
            void open();
          }}
          disabled={opening}
          aria-busy={opening}
          className="underline font-medium hover:no-underline disabled:opacity-60"
          data-testid="subscription-past-due-portal"
        >
          {opening ? "Opening…" : "Update payment method"}
        </button>
        {error ? (
          <span className="text-xs text-amber-900/80" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

import {
  getCheckoutUnavailableMessage,
  resolvePaddleCheckout,
} from "@/lib/paddle";

/**
 * Payments banner.
 *
 * Renders one of:
 *   - sandbox     → visible test-mode banner ("Payments are in test mode …")
 *   - unavailable → visible blocking banner (loopback+live, or missing token)
 *   - live        → subtle "Live payments enabled" indicator (L6 audit fix).
 *                   Previously rendered nothing, which made it impossible to
 *                   distinguish "live payments working" from "banner broken"
 *                   on the published site. Always visible so both operator
 *                   spot-checks and grower trust cues have a signal.
 *
 * Never renders or logs the token value.
 */
export function PaymentTestModeBanner() {
  const env = resolvePaddleCheckout();

  if (env === "sandbox") {
    return (
      <div
        data-testid="payments-test-mode-banner"
        data-payment-env="sandbox"
        className="w-full bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-800 px-4 py-2 text-center text-xs md:text-sm text-amber-900 dark:text-amber-100"
      >
        Payments are in <strong>test mode</strong> in this preview. No real charges are made.{" "}
        <a
          href="https://docs.lovable.dev/features/payments#test-and-live-environments"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          Learn more
        </a>
      </div>
    );
  }

  if (env === "unavailable") {
    const message = getCheckoutUnavailableMessage();
    if (!message) return null;
    return (
      <div
        role="status"
        data-testid="payments-unavailable-banner"
        data-payment-env="unavailable"
        className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-center text-xs md:text-sm text-destructive"
      >
        {message}
      </div>
    );
  }

  // env === 'live': subtle confirmation strip. Not alarming, not celebratory —
  // just a signal that real charges are enabled on this build.
  return (
    <div
      data-testid="payments-live-mode-banner"
      data-payment-env="live"
      className="w-full bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900 px-4 py-1.5 text-center text-[11px] md:text-xs text-emerald-800 dark:text-emerald-200"
    >
      Live payments enabled · secured by Paddle
    </div>
  );
}

export default PaymentTestModeBanner;


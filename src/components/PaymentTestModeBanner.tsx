import { getCheckoutUnavailableMessage, resolvePaddleCheckout } from "@/lib/paddle";

/**
 * Payments banner.
 *
 * Renders one of:
 *   - sandbox → visible test-only banner on every host
 *   - anything else → visible fail-closed availability banner
 *
 * Never renders or logs the token value.
 */
export function PaymentTestModeBanner() {
  const env = resolvePaddleCheckout();

  if (env === "sandbox") {
    return (
      <aside
        aria-label="Payment environment"
        aria-live="polite"
        data-testid="payments-test-mode-banner"
        data-payment-env="sandbox"
        className="w-full bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-800 px-4 py-2 text-center text-xs md:text-sm text-amber-900 dark:text-amber-100"
      >
        Paddle <strong>sandbox</strong> is in <strong>test mode</strong>. No real charges are made.{" "}
        <a
          href="https://docs.lovable.dev/features/payments#test-and-live-environments"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          Learn more
        </a>
      </aside>
    );
  }

  const message = getCheckoutUnavailableMessage();
  if (!message) return null;
  return (
    <aside
      aria-label="Payment availability"
      aria-live="polite"
      data-testid="payments-unavailable-banner"
      data-payment-env="unavailable"
      className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-center text-xs md:text-sm text-destructive"
    >
      {message}
    </aside>
  );
}

export default PaymentTestModeBanner;

import {
  getCheckoutUnavailableMessage,
  resolvePaddleCheckout,
} from "@/lib/paddle";

/**
 * Payments banner (Slice A).
 *
 * Renders one of:
 *   - sandbox   → visible test-mode banner ("Payments are in test mode …")
 *   - unavailable → visible blocking banner (loopback+live, or missing token)
 *   - live      → nothing
 *
 * Never renders or logs the token value.
 */
export function PaymentTestModeBanner() {
  const env = resolvePaddleCheckout();

  if (env === "sandbox") {
    return (
      <div
        data-testid="payments-test-mode-banner"
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
        className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-center text-xs md:text-sm text-destructive"
      >
        {message}
      </div>
    );
  }

  return null;
}

export default PaymentTestModeBanner;

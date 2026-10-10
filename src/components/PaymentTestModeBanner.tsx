import { useHasRole } from "@/hooks/useHasRole";
import { shouldShowPaddleSandboxTestModeBanner } from "@/lib/paymentTestModeBannerVisibilityRules";
import { getCheckoutUnavailableMessage, resolvePaddleCheckout } from "@/lib/paddle";

/**
 * Payments banner.
 *
 * Renders one of:
 *   - sandbox → visible test-only banner when the caller asks for it
 *   - anything else → visible fail-closed availability banner
 *
 * The site mount is `SitePaymentTestModeBanner`, which shows the sandbox
 * banner only to operators. This presenter defaults to showing it so existing
 * callers and the accessibility contract keep the same copy.
 *
 * Never renders or logs the token value. Does not choose sandbox vs live.
 */
export function PaymentTestModeBanner({
  showSandboxTestMode = true,
}: {
  showSandboxTestMode?: boolean;
} = {}) {
  const env = resolvePaddleCheckout();

  if (env === "sandbox") {
    if (!showSandboxTestMode) return null;
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

/**
 * Sitewide mount. Operators still see the sandbox test-mode banner.
 * Everyone else, including signed-out visitors, does not. Checkout
 * availability copy is unchanged.
 */
export function SitePaymentTestModeBanner() {
  const operator = useHasRole("operator");
  return (
    <PaymentTestModeBanner
      showSandboxTestMode={shouldShowPaddleSandboxTestModeBanner(operator.granted)}
    />
  );
}

export default PaymentTestModeBanner;

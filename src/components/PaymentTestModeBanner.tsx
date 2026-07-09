import { getPaddleEnvironment } from "@/lib/paddle";

/**
 * Renders a persistent banner while Verdant is running against the
 * Paddle TEST environment (Lovable preview builds). Renders nothing
 * when the client token is a live token (production build).
 */
export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

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

export default PaymentTestModeBanner;

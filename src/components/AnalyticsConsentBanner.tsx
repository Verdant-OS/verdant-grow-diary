import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { Button } from "@/components/ui/button";

/**
 * Explicit opt-in gate for analytics. Nothing analytics-related loads until
 * the grower presses Accept; Decline stores a durable refusal so the banner
 * does not reappear. Rendered only after hydration to avoid a mismatch.
 */
export function AnalyticsConsentBanner() {
  const { decision, hydrated, accept, decline } = useAnalyticsConsent();

  if (!hydrated || decision !== "unset") return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Analytics consent"
      data-testid="analytics-consent-banner"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use Google Analytics to understand which parts of Verdant growers actually
          use. Nothing loads until you accept, and your grow data is never sent to
          analytics.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="analytics-consent-decline"
            onClick={decline}
          >
            Decline
          </Button>
          <Button
            className="min-h-11 flex-1 sm:flex-none"
            data-testid="analytics-consent-accept"
            onClick={accept}
          >
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsConsentBanner;

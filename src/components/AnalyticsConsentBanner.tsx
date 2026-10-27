import { useLayoutEffect, useRef } from "react";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY,
  analyticsConsentBannerOffsetValue,
} from "@/lib/analyticsConsentBannerLayout";

/**
 * Explicit opt-in gate for analytics. Nothing analytics-related loads until
 * the grower presses Accept; Decline stores a durable refusal so the banner
 * does not reappear. Rendered only after hydration to avoid a mismatch.
 *
 * While visible, the measured height is published as a document offset so
 * page content can sit above the fixed bar. Accept and Decline are unchanged.
 */
export function AnalyticsConsentBanner() {
  const { decision, hydrated, accept, decline } = useAnalyticsConsent();
  const bannerRef = useRef<HTMLDivElement>(null);
  const visible = hydrated && decision === "unset";

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty(ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY);
      return;
    }
    const node = bannerRef.current;
    if (!node) return;

    const publish = () => {
      const value = analyticsConsentBannerOffsetValue(node.getBoundingClientRect().height);
      if (value) root.style.setProperty(ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY, value);
      else root.style.removeProperty(ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY);
    };
    publish();

    if (typeof ResizeObserver === "undefined") {
      return () => {
        root.style.removeProperty(ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY);
      };
    }
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      role="dialog"
      aria-live="polite"
      aria-label="Analytics consent"
      data-testid="analytics-consent-banner"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-4 sm:py-1.5"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-normal">
          We use Google Analytics to understand which parts of Verdant growers actually use. Nothing
          loads until you accept, and your grow data is never sent to analytics.
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

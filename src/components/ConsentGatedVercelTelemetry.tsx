import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import {
  isVercelTelemetryEventOnNoAnalyticsPage,
  shouldMountVercelTelemetry,
} from "@/lib/vercelTelemetryRules";

// SDK scripts can outlive their React mount. Recheck the authoritative decision
// for every event, including after another tab revokes consent or storage fails,
// and drop events recorded on a no-analytics page after a client-side navigation.
function beforeSendWithConsent<T>(event: T): T | null {
  if (isVercelTelemetryEventOnNoAnalyticsPage(event)) return null;
  return readAnalyticsConsent() === "granted" ? event : null;
}

// The root re-renders on every route change, so this read stays current.
function currentPathname(): string | null {
  return typeof window === "undefined" ? null : window.location.pathname;
}

export function ConsentGatedVercelAnalytics() {
  const { decision } = useAnalyticsConsent();
  return shouldMountVercelTelemetry({ decision, pathname: currentPathname() }) ? (
    <Analytics beforeSend={beforeSendWithConsent} />
  ) : null;
}

export function ConsentGatedSpeedInsights() {
  const { decision } = useAnalyticsConsent();
  return shouldMountVercelTelemetry({ decision, pathname: currentPathname() }) ? (
    <SpeedInsights beforeSend={beforeSendWithConsent} />
  ) : null;
}

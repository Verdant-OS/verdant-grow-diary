import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { readAnalyticsConsent } from "@/lib/analyticsConsent";

// SDK scripts can outlive their React mount. Recheck the authoritative decision
// for every event, including after another tab revokes consent or storage fails.
function beforeSendWithConsent<T>(event: T): T | null {
  return readAnalyticsConsent() === "granted" ? event : null;
}

export function ConsentGatedVercelAnalytics() {
  const { decision } = useAnalyticsConsent();
  return decision === "granted" ? <Analytics beforeSend={beforeSendWithConsent} /> : null;
}

export function ConsentGatedSpeedInsights() {
  const { decision } = useAnalyticsConsent();
  return decision === "granted" ? <SpeedInsights beforeSend={beforeSendWithConsent} /> : null;
}

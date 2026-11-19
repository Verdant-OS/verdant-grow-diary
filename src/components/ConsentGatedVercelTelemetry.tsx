import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import { isNoAnalyticsPublicPath } from "@/lib/posthogAnalyticsRules";

/**
 * The beta pages promise "No analytics." (#2714), so Vercel telemetry stays off
 * there even with consent. Consent is "unset" until the client reads storage,
 * so this window check never runs during the server render.
 */
function isOnNoAnalyticsPage(): boolean {
  return typeof window !== "undefined" && isNoAnalyticsPublicPath(window.location.pathname);
}

function eventTargetsNoAnalyticsPage(event: unknown): boolean {
  if (typeof window === "undefined" || typeof event !== "object" || event === null) return false;
  const url = (event as { url?: unknown }).url;
  if (typeof url !== "string" || url === "") return false;
  try {
    return isNoAnalyticsPublicPath(new URL(url, window.location.origin).pathname);
  } catch {
    return false;
  }
}

function beforeSendWithConsent<T>(event: T): T | null {
  if (isOnNoAnalyticsPage() || eventTargetsNoAnalyticsPage(event)) return null;
  return readAnalyticsConsent() === "granted" ? event : null;
}

export function ConsentGatedVercelAnalytics() {
  const { decision } = useAnalyticsConsent();
  return decision === "granted" && !isOnNoAnalyticsPage() ? (
    <Analytics beforeSend={beforeSendWithConsent} />
  ) : null;
}

export function ConsentGatedSpeedInsights() {
  const { decision } = useAnalyticsConsent();
  return decision === "granted" && !isOnNoAnalyticsPage() ? (
    <SpeedInsights beforeSend={beforeSendWithConsent} />
  ) : null;
}

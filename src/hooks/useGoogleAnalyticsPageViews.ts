import { useEffect, useState } from "react";
import { useLocation } from "@/lib/react-router-compat";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import { buildSafeAnalyticsPageLocation, sanitizePagePath } from "@/lib/analyticsPageViewRules";
import { readAnalyticsConsent, subscribeToAnalyticsConsent } from "@/lib/analyticsConsent";
import { loadGoogleAnalytics } from "@/lib/googleAnalyticsLoader";

export { sanitizePagePath } from "@/lib/analyticsPageViewRules";

/**
 * Declared global for the GA4 gtag function injected by the consent-gated loader.
 */
declare global {
  interface Window {
    gtag?: (command: string, targetId: string, config?: Record<string, unknown>) => void;
    dataLayer?: unknown[];
  }
}

function trackPageView(path: string, title: string) {
  if (typeof window === "undefined") return;
  // Consent gate: no analytics call may run before an explicit "granted".
  if (readAnalyticsConsent() !== "granted") return;
  // Install the gtag stub if needed so cold loads are not dropped before AnalyticsShell hydrates.
  loadGoogleAnalytics();
  if (typeof window.gtag !== "function") return;
  const safePath = sanitizePagePath(path);
  // Explicit page_view event (config uses send_page_view: false). SPA-safe, path-sanitized.
  window.gtag("event", "page_view", {
    send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
    page_path: safePath,
    page_location: buildSafeAnalyticsPageLocation(window.location.origin, safePath),
    page_title: title,
  });
}

/**
 * Mount once inside the settled TanStack Router tree.
 * Sends a GA4 page_view on initial load and on every subsequent route change.
 * No-ops safely when gtag is absent (tests, ad blockers, SSR-like envs).
 */
export function useGoogleAnalyticsPageViews() {
  const location = useLocation();

  // Re-hydrate after mount so a pre-granted stored decision is applied after SSR "unset".
  const [consent, setConsent] = useState(() => readAnalyticsConsent());
  useEffect(() => {
    setConsent(readAnalyticsConsent());
    return subscribeToAnalyticsConsent(() => setConsent(readAnalyticsConsent()));
  }, []);

  useEffect(() => {
    if (consent !== "granted") return;
    trackPageView(location.pathname, document.title);
  }, [location.pathname, consent]);
}

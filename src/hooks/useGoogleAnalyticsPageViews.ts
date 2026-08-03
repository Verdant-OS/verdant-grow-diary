import { useEffect, useState } from "react";
import { useLocation } from "@/lib/react-router-compat";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import { buildSafeAnalyticsPageLocation, sanitizePagePath } from "@/lib/analyticsPageViewRules";
import { readAnalyticsConsent, subscribeToAnalyticsConsent } from "@/lib/analyticsConsent";

export { sanitizePagePath } from "@/lib/analyticsPageViewRules";

/**
 * Declared global for the GA4 gtag function injected by the script in index.html.
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
  if (typeof window.gtag !== "function") return;
  const safePath = sanitizePagePath(path);
  // Send an explicit page_view EVENT, not a repeat `config` call. index.html
  // bootstraps this measurement id with `send_page_view: false` so the initial
  // automatic hit can never fire with an unsanitized URL. Settings passed to
  // `config` persist for that id, so a later `config` call is not a reliable
  // way to emit a view — under that reading every page view is silently
  // dropped and the property goes dark. `event`/`page_view` is GA4's
  // documented SPA pattern: exactly one view per route change, correct
  // regardless of how `config` merging is interpreted.
  window.gtag("event", "page_view", {
    send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
    page_path: safePath,
    page_location: buildSafeAnalyticsPageLocation(window.location.origin, safePath),
    page_title: title,
  });
}

/**
 * Mount once inside the React Router tree (below BrowserRouter).
 * Sends a GA4 page_view on initial load and on every subsequent route change.
 * No-ops safely when gtag is absent (tests, ad blockers, SSR-like envs).
 */
export function useGoogleAnalyticsPageViews() {
  const location = useLocation();

  // Re-run when consent flips so the first view is sent right after Accept.
  const [consent, setConsent] = useState(() => readAnalyticsConsent());
  useEffect(() => subscribeToAnalyticsConsent(() => setConsent(readAnalyticsConsent())), []);

  useEffect(() => {
    if (consent !== "granted") return;
    trackPageView(location.pathname, document.title);
  }, [location.pathname, consent]);
}

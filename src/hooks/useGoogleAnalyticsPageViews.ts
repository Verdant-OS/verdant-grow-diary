import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import { buildSafeAnalyticsPageLocation, sanitizePagePath } from "@/lib/analyticsPageViewRules";

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
  if (typeof window.gtag !== "function") return;
  const safePath = sanitizePagePath(path);
  window.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
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

  useEffect(() => {
    trackPageView(location.pathname, document.title);
  }, [location.pathname]);
}

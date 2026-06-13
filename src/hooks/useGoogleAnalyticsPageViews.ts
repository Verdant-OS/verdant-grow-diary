import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

/**
 * Declared global for the GA4 gtag function injected by the script in index.html.
 */
declare global {
  interface Window {
    gtag?: (
      command: string,
      targetId: string,
      config?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

const UUID_RE = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_TOKEN_RE = /\/[a-zA-Z0-9_-]{20,}/g;

/**
 * Sanitize a page path before sending to analytics.
 * Replaces UUIDs and long random token-like segments with :id
 * to avoid leaking private identifiers.
 */
export function sanitizePagePath(path: string): string {
  return path
    .replace(UUID_RE, "/:id")
    .replace(LONG_TOKEN_RE, "/:id");
}

function trackPageView(path: string, title: string) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  const safePath = sanitizePagePath(path);
  window.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
    page_path: safePath,
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
    trackPageView(location.pathname + location.search, document.title);
  }, [location.pathname, location.search]);
}


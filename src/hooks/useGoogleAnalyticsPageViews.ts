import { useEffect, useState } from "react";
import { useLocation } from "@/lib/react-router-compat";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import { buildSafeAnalyticsPageLocation, sanitizePagePath } from "@/lib/analyticsPageViewRules";
import { readAnalyticsConsent, subscribeToAnalyticsConsent } from "@/lib/analyticsConsent";
import { loadGoogleAnalytics } from "@/lib/googleAnalyticsLoader";

export { sanitizePagePath } from "@/lib/analyticsPageViewRules";

/**
 * Declared global for the GA4 gtag function injected by the root-route head.
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
  // Ensure the consent-gated loader has installed the gtag stub. AnalyticsShell
  // also loads on decision==="granted", but that hook intentionally starts as
  // "unset" for hydration, so cold loads with pre-granted consent used to hit
  // this path before window.gtag existed and silently dropped the first view.
  loadGoogleAnalytics();
  if (typeof window.gtag !== "function") return;
  const safePath = sanitizePagePath(path);
  // Send an explicit page_view EVENT, not a repeat `config` call. The root route
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
 * Mount once inside the settled TanStack Router tree.
 * Sends a GA4 page_view on initial load and on every subsequent route change.
 * No-ops safely when gtag is absent (tests, ad blockers, SSR-like envs).
 */
export function useGoogleAnalyticsPageViews() {
  const location = useLocation();

  // Match useAnalyticsConsent: start from storage when available, then re-hydrate
  // in an effect so SSR "unset" catches up to a pre-granted local decision and
  // the cold-load page_view is not skipped forever.
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

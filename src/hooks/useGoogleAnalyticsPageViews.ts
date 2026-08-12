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

/**
 * Returns the current canonical pathname only when the document exposes
 * exactly one clean, same-origin http(s) canonical. Anything ambiguous or
 * cross-origin fails closed so it cannot authorize a literal analytics slug.
 */
function readTrustedCanonicalPathname(): string | null {
  const canonicalLinks = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>("link[rel]"),
  ).filter((link) => link.rel.toLowerCase().split(/\s+/).includes("canonical"));
  if (canonicalLinks.length !== 1) return null;

  const href = canonicalLinks[0].getAttribute("href")?.trim();
  if (!href) return null;

  try {
    const currentOrigin = new URL(window.location.origin);
    const canonical = new URL(href, currentOrigin);
    const isHttpOrigin = currentOrigin.protocol === "http:" || currentOrigin.protocol === "https:";
    const isHttpCanonical = canonical.protocol === "http:" || canonical.protocol === "https:";

    if (!isHttpOrigin || !isHttpCanonical || canonical.origin !== currentOrigin.origin) {
      return null;
    }
    if (canonical.username || canonical.password || canonical.search || canonical.hash) {
      return null;
    }

    return canonical.pathname;
  } catch {
    return null;
  }
}

function trackPageView(path: string, title: string) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  const trustedCanonicalPathname = readTrustedCanonicalPathname();
  const safePath = sanitizePagePath(path, trustedCanonicalPathname);
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
    page_location: buildSafeAnalyticsPageLocation(
      window.location.origin,
      path,
      trustedCanonicalPathname,
    ),
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

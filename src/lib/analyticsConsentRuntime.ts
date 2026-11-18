import {
  persistedGrantWouldSurviveReload,
  type AnalyticsConsentDecision,
} from "@/lib/analyticsConsent";
import {
  isAhrefsAnalyticsLoaded,
  loadAhrefsAnalytics,
  removeAhrefsAnalyticsScript,
} from "@/lib/ahrefsAnalyticsLoader";
import { loadGoogleAnalytics, setGoogleAnalyticsOptOut } from "@/lib/googleAnalyticsLoader";
import { isGoogleTagManagerLoaded, loadGoogleTagManager } from "@/lib/googleTagManagerLoader";
import { isExcludedAnalyticsPath } from "@/lib/posthogAnalyticsRules";
import { syncPostHogWithConsent } from "@/lib/posthogClient";

/**
 * Apply the browser-local consent decision to every site analytics provider.
 * Provider loaders remain idempotent and receive no grower-content payloads.
 *
 * Google Tag Manager cannot be unloaded and has no kill switch, so a container
 * that already ran forces a reload when consent is withdrawn or an excluded
 * route opens, exactly like an already-running Ahrefs tag.
 */
export function applyAnalyticsConsentDecision(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
): boolean {
  if (isExcludedAnalyticsPath(location.pathname)) {
    syncPostHogWithConsent("denied", location);
    setGoogleAnalyticsOptOut(true);
    const tagWasPresent = isAhrefsAnalyticsLoaded() || isGoogleTagManagerLoaded();
    removeAhrefsAnalyticsScript();
    if (persistedGrantWouldSurviveReload()) return false;
    return tagWasPresent;
  }

  const granted = decision === "granted";
  syncPostHogWithConsent(granted ? "granted" : decision, location);
  setGoogleAnalyticsOptOut(!granted);

  if (granted) {
    loadGoogleAnalytics();
    loadGoogleTagManager();
    if (location.pathname === "/" && location.search === "" && location.hash === "") {
      loadAhrefsAnalytics();
      return false;
    }
  }

  const mustReload = isAhrefsAnalyticsLoaded() || (!granted && isGoogleTagManagerLoaded());
  removeAhrefsAnalyticsScript();
  if (persistedGrantWouldSurviveReload()) return false;
  return mustReload;
}

/**
 * Toolkit routes unmount the analytics shell before it can see the new URL.
 * Apply the same provider gate once that route is current.
 * Returns true when the document should reload to stop an already-running tag.
 */
export function tearDownAnalyticsForExcludedRoute(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
): boolean {
  if (!isExcludedAnalyticsPath(location.pathname)) return false;
  return applyAnalyticsConsentDecision(decision, location);
}

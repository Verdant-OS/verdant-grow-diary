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
import { isExcludedAnalyticsPath } from "@/lib/posthogAnalyticsRules";
import { syncPostHogWithConsent } from "@/lib/posthogClient";

/**
 * Apply the browser-local consent decision to every site analytics provider.
 * Provider loaders remain idempotent and receive no grower-content payloads.
 */
export function applyAnalyticsConsentDecision(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
): boolean {
  if (isExcludedAnalyticsPath(location.pathname)) {
    syncPostHogWithConsent("denied", location);
    setGoogleAnalyticsOptOut(true);
    const tagWasPresent = isAhrefsAnalyticsLoaded();
    removeAhrefsAnalyticsScript();
    if (persistedGrantWouldSurviveReload()) return false;
    return tagWasPresent;
  }

  const granted = decision === "granted";
  syncPostHogWithConsent(granted ? "granted" : decision, location);
  setGoogleAnalyticsOptOut(!granted);

  if (granted) {
    loadGoogleAnalytics();
    if (location.pathname === "/" && location.search === "" && location.hash === "") {
      loadAhrefsAnalytics();
      return false;
    }
  }

  const mustReload = isAhrefsAnalyticsLoaded();
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

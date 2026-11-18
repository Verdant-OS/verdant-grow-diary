import {
  persistedGrantWouldSurviveReload,
  revocationSurvivesReload,
  type AnalyticsConsentDecision,
} from "@/lib/analyticsConsent";
import {
  isAhrefsAnalyticsLoaded,
  loadAhrefsAnalytics,
  removeAhrefsAnalyticsScript,
} from "@/lib/ahrefsAnalyticsLoader";
import { loadGoogleAnalytics, setGoogleAnalyticsOptOut } from "@/lib/googleAnalyticsLoader";
import {
  denyGoogleTagManagerConsent,
  isGoogleTagManagerLoaded,
  loadGoogleTagManager,
} from "@/lib/googleTagManagerLoader";
import { isExcludedAnalyticsPath } from "@/lib/posthogAnalyticsRules";
import { syncPostHogWithConsent } from "@/lib/posthogClient";

/**
 * Apply the browser-local consent decision to every site analytics provider.
 * Provider loaders remain idempotent and receive no grower-content payloads.
 *
 * Google Tag Manager cannot be unloaded and has no kill switch. A container that
 * already ran gets Google consent-mode denial at once, and the document reloads
 * whenever the reload keeps the denial: after a failed revoke that left the old
 * grant in localStorage, the session-scoped denial is enough. Only when neither
 * store can hold the denial does the container stay, under consent denial.
 */
export function applyAnalyticsConsentDecision(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
): boolean {
  if (isExcludedAnalyticsPath(location.pathname)) {
    syncPostHogWithConsent("denied", location);
    setGoogleAnalyticsOptOut(true);
    const containerRan = denyGoogleTagManagerConsent();
    const tagWasPresent = isAhrefsAnalyticsLoaded() || containerRan;
    removeAhrefsAnalyticsScript();
    if (persistedGrantWouldSurviveReload()) return containerRan && revocationSurvivesReload();
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

  const containerRan = !granted && denyGoogleTagManagerConsent();
  const mustReload = isAhrefsAnalyticsLoaded() || containerRan;
  removeAhrefsAnalyticsScript();
  if (persistedGrantWouldSurviveReload()) return containerRan && revocationSurvivesReload();
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

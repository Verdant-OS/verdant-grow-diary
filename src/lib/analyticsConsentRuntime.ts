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
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";

/**
 * Apply the browser-local consent decision to every site analytics provider.
 * Provider loaders remain idempotent and receive no grower-content payloads.
 */
export function applyAnalyticsConsentDecision(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
): boolean {
  if (isExcludedAnalyticsRoute(location.pathname)) {
    setGoogleAnalyticsOptOut(true);
    const tagWasPresent = isAhrefsAnalyticsLoaded();
    removeAhrefsAnalyticsScript();
    if (persistedGrantWouldSurviveReload()) return false;
    return tagWasPresent;
  }

  const granted = decision === "granted";
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

function isExcludedAnalyticsRoute(pathname: string): boolean {
  return pathname === GROW_HELP_TOOLKIT_PATH || pathname === `${GROW_HELP_TOOLKIT_PATH}/`;
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
  if (!isExcludedAnalyticsRoute(location.pathname)) return false;
  return applyAnalyticsConsentDecision(decision, location);
}

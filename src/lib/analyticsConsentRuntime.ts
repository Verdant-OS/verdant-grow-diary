import type { AnalyticsConsentDecision } from "@/lib/analyticsConsent";
import {
  isAhrefsAnalyticsLoaded,
  loadAhrefsAnalytics,
  removeAhrefsAnalyticsScript,
} from "@/lib/ahrefsAnalyticsLoader";
import { loadGoogleAnalytics, setGoogleAnalyticsOptOut } from "@/lib/googleAnalyticsLoader";

/**
 * Apply the browser-local consent decision to every site analytics provider.
 * Provider loaders remain idempotent and receive no grower-content payloads.
 */
export function applyAnalyticsConsentDecision(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
): boolean {
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
  return mustReload;
}

/**
 * Pure rules for Vercel Web Analytics and Speed Insights. No SDK import, no
 * network, no clock.
 *
 * Both load only after analytics consent is granted, and never on the public
 * pages whose own copy tells the visitor "No analytics." (#2714):
 * /creator-beta and /breeder-beta, matched the same way as for every other
 * provider (any letter case, repeated or trailing slashes, percent-escapes).
 */

import type { AnalyticsConsentDecision } from "@/lib/analyticsConsent";
import { isNoAnalyticsPublicPath } from "@/lib/posthogAnalyticsRules";

/**
 * Whether the Vercel SDK components may mount. An unknown path fails closed.
 */
export function shouldMountVercelTelemetry(input: {
  decision: AnalyticsConsentDecision | null | undefined;
  pathname: string | null | undefined;
}): boolean {
  if (input.decision !== "granted") return false;
  if (typeof input.pathname !== "string" || input.pathname === "") return false;
  return !isNoAnalyticsPublicPath(input.pathname);
}

/** Parses a relative event URL only; it is never contacted. */
const RELATIVE_EVENT_URL_BASE = "https://verdantgrowdiary.com";

/**
 * An SDK that loaded on another page keeps running after a client-side
 * navigation, so each event is checked against the page it was recorded on.
 * True means the event came from a no-analytics page and must be dropped.
 */
export function isVercelTelemetryEventOnNoAnalyticsPage(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return false;
  const url = (event as { url?: unknown }).url;
  if (typeof url !== "string" || url === "") return false;
  let pathname: string;
  try {
    pathname = new URL(url, RELATIVE_EVENT_URL_BASE).pathname;
  } catch {
    return false;
  }
  return isNoAnalyticsPublicPath(pathname);
}

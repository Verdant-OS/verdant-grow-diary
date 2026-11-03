/**
 * Consent-gated events for the public Athena feed log.
 * Numeric counters and fixed enums only. Never grower text.
 */

import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const FEED_LOG_ANALYTICS_EVENTS = [
  "feed_log_calculated",
  "feed_log_row_added",
  "feed_log_row_removed",
  "feed_log_csv_exported",
  "feed_log_copied",
  "feed_log_printed",
  "feed_log_cta_click",
  "feed_log_line_changed",
] as const;

export type FeedLogAnalyticsEvent = (typeof FEED_LOG_ANALYTICS_EVENTS)[number];

export const FEED_LOG_CTA_LOCATIONS = ["tool", "article", "footer"] as const;
export type FeedLogCtaLocation = (typeof FEED_LOG_CTA_LOCATIONS)[number];

export const FEED_LOG_LINES = ["pro_line", "blended"] as const;
export type FeedLogLineParam = (typeof FEED_LOG_LINES)[number];

export interface FeedLogAnalyticsParams {
  weeks_filled?: number;
  weeks_flagged?: number;
  product_count?: number;
  row_count?: number;
  cta_location?: FeedLogCtaLocation;
  line?: FeedLogLineParam;
}

const NUMBER_KEYS = ["weeks_filled", "weeks_flagged", "product_count", "row_count"] as const;

export function sanitizeFeedLogAnalyticsParams(
  params?: FeedLogAnalyticsParams,
): FeedLogAnalyticsParams {
  if (!params) return {};
  const safe: FeedLogAnalyticsParams = {};
  for (const key of NUMBER_KEYS) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
  }
  if (params.cta_location && FEED_LOG_CTA_LOCATIONS.includes(params.cta_location)) {
    safe.cta_location = params.cta_location;
  }
  if (params.line && FEED_LOG_LINES.includes(params.line)) {
    safe.line = params.line;
  }
  return safe;
}

export function trackFeedLogEvent(
  name: FeedLogAnalyticsEvent,
  params?: FeedLogAnalyticsParams,
): void {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;
  const safe = sanitizeFeedLogAnalyticsParams(params);
  try {
    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, { detail: { name, props: safe } }),
    );
  } catch {
    /* analytics must never break the page */
  }
  try {
    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag("event", name, safe);
  } catch {
    /* analytics must never break the page */
  }
}

/**
 * Consent-gated events for the public Harvest Window Tracker.
 * Numeric counters and fixed enums only. Never grower text.
 */

import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import {
  HARVEST_HANDOFF_COUNT_BUCKETS,
  type HarvestHandoffCountBucket,
} from "@/lib/harvestCheckHandoffStore";
import { HARVEST_TARGETS, type HarvestTarget } from "@/lib/harvestWindowRules";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const HARVEST_TRACKER_ANALYTICS_EVENTS = [
  "harvest_tracker_check_added",
  "harvest_tracker_check_removed",
  "harvest_tracker_clear",
  "harvest_tracker_copy",
  "harvest_tracker_cta_click",
  "harvest_tracker_export_csv",
  "harvest_tracker_handoff_imported",
  "harvest_tracker_handoff_saved",
  "harvest_tracker_print",
  "harvest_tracker_target_changed",
] as const;

export type HarvestTrackerAnalyticsEvent = (typeof HARVEST_TRACKER_ANALYTICS_EVENTS)[number];

export const HARVEST_TRACKER_CTA_LOCATIONS = ["tool", "article", "footer"] as const;
export type HarvestTrackerCtaLocation = (typeof HARVEST_TRACKER_CTA_LOCATIONS)[number];

export interface HarvestTrackerAnalyticsParams {
  check_count?: number;
  plant_count?: number;
  target?: HarvestTarget;
  cta_location?: HarvestTrackerCtaLocation;
  count_bucket?: HarvestHandoffCountBucket;
}

const NUMBER_KEYS = ["check_count", "plant_count"] as const;

export function sanitizeHarvestTrackerAnalyticsParams(
  params?: HarvestTrackerAnalyticsParams,
): HarvestTrackerAnalyticsParams {
  if (!params) return {};
  const safe: HarvestTrackerAnalyticsParams = {};
  for (const key of NUMBER_KEYS) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
  }
  if (params.target && HARVEST_TARGETS.includes(params.target)) safe.target = params.target;
  if (params.cta_location && HARVEST_TRACKER_CTA_LOCATIONS.includes(params.cta_location)) {
    safe.cta_location = params.cta_location;
  }
  if (params.count_bucket && HARVEST_HANDOFF_COUNT_BUCKETS.includes(params.count_bucket)) {
    safe.count_bucket = params.count_bucket;
  }
  return safe;
}

export function trackHarvestTrackerEvent(
  name: HarvestTrackerAnalyticsEvent,
  params?: HarvestTrackerAnalyticsParams,
): void {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;
  const safe = sanitizeHarvestTrackerAnalyticsParams(params);
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

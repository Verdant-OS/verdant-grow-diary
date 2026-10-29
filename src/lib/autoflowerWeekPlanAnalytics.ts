/**
 * Consent-gated events for the public autoflower week-by-week planner.
 * Numeric counters and fixed enums only. Never grower text.
 */

import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import { LIGHT_CODES, type LightCode } from "@/lib/autoflowerWeekPlanRules";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const AUTOFLOWER_PLANNER_ANALYTICS_EVENTS = [
  "autoflower_planner_generated",
  "autoflower_planner_clear",
  "autoflower_planner_copy",
  "autoflower_planner_cta_click",
  "autoflower_planner_export_csv",
  "autoflower_planner_milestone_logged",
  "autoflower_planner_print",
  "autoflower_planner_stage_edited",
  "autoflower_planner_trichome_link_click",
] as const;

export type AutoflowerPlannerAnalyticsEvent = (typeof AUTOFLOWER_PLANNER_ANALYTICS_EVENTS)[number];

export const AUTOFLOWER_PLANNER_CTA_LOCATIONS = ["tool", "article", "footer"] as const;
export type AutoflowerPlannerCtaLocation = (typeof AUTOFLOWER_PLANNER_CTA_LOCATIONS)[number];

export interface AutoflowerPlannerAnalyticsParams {
  estimate_weeks?: number;
  week_count?: number;
  milestone_count?: number;
  light?: LightCode;
  cta_location?: AutoflowerPlannerCtaLocation;
}

const NUMBER_KEYS = ["estimate_weeks", "week_count", "milestone_count"] as const;

export function sanitizeAutoflowerPlannerAnalyticsParams(
  params?: AutoflowerPlannerAnalyticsParams,
): AutoflowerPlannerAnalyticsParams {
  if (!params) return {};
  const safe: AutoflowerPlannerAnalyticsParams = {};
  for (const key of NUMBER_KEYS) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
  }
  if (params.light && LIGHT_CODES.includes(params.light)) safe.light = params.light;
  if (params.cta_location && AUTOFLOWER_PLANNER_CTA_LOCATIONS.includes(params.cta_location)) {
    safe.cta_location = params.cta_location;
  }
  return safe;
}

export function trackAutoflowerPlannerEvent(
  name: AutoflowerPlannerAnalyticsEvent,
  params?: AutoflowerPlannerAnalyticsParams,
): void {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;
  const safe = sanitizeAutoflowerPlannerAnalyticsParams(params);
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

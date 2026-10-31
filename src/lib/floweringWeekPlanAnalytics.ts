/**
 * Consent-gated events for the public flowering week-by-week planner.
 * Integer counters and fixed enums only. Never grower text.
 */

import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const FLOWERING_PLANNER_ANALYTICS_EVENTS = [
  "flowering_planner_clear",
  "flowering_planner_copy",
  "flowering_planner_cta_click",
  "flowering_planner_export_csv",
  "flowering_planner_generated",
  "flowering_planner_milestone_logged",
  "flowering_planner_plant_type",
  "flowering_planner_print",
  "flowering_planner_stage_edited",
  "flowering_planner_trichome_link_click",
] as const;

export type FloweringPlannerAnalyticsEvent = (typeof FLOWERING_PLANNER_ANALYTICS_EVENTS)[number];

export const FLOWERING_PLANNER_CTA_LOCATIONS = ["tool", "article", "footer"] as const;
export type FloweringPlannerCtaLocation = (typeof FLOWERING_PLANNER_CTA_LOCATIONS)[number];

export const FLOWERING_PLANNER_PLANT_TYPES = ["photoperiod", "autoflower"] as const;
export type FloweringPlannerPlantType = (typeof FLOWERING_PLANNER_PLANT_TYPES)[number];

export interface FloweringPlannerAnalyticsParams {
  flower_weeks?: number;
  week_count?: number;
  milestone_count?: number;
  type?: FloweringPlannerPlantType;
  cta_location?: FloweringPlannerCtaLocation;
}

const INT_KEYS = ["flower_weeks", "week_count", "milestone_count"] as const;

export function sanitizeFloweringPlannerAnalyticsParams(
  params?: FloweringPlannerAnalyticsParams,
): FloweringPlannerAnalyticsParams {
  if (!params) return {};
  const safe: FloweringPlannerAnalyticsParams = {};
  for (const key of INT_KEYS) {
    const value = params[key];
    if (typeof value === "number" && Number.isInteger(value)) safe[key] = value;
  }
  if (params.type && FLOWERING_PLANNER_PLANT_TYPES.includes(params.type)) safe.type = params.type;
  if (params.cta_location && FLOWERING_PLANNER_CTA_LOCATIONS.includes(params.cta_location)) {
    safe.cta_location = params.cta_location;
  }
  return safe;
}

export function trackFloweringPlannerEvent(
  name: FloweringPlannerAnalyticsEvent,
  params?: FloweringPlannerAnalyticsParams,
): void {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;
  const safe = sanitizeFloweringPlannerAnalyticsParams(params);
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

/**
 * Consent-gated events for the public Tent Climate Check & Log.
 * Numeric counters and fixed enums only. Never grower text.
 */

import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import type { GrowTentBandStatusCode } from "@/lib/growTentClimateRules";
import { PUBLIC_VPD_CHART_STAGES, type PublicVpdChartStageId } from "@/lib/publicVpdChartRules";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const CLIMATE_TOOL_ANALYTICS_EVENTS = [
  "climate_tool_checked",
  "climate_tool_clear",
  "climate_tool_copy",
  "climate_tool_cta_click",
  "climate_tool_export_csv",
  "climate_tool_fix_opened",
  "climate_tool_print",
  "climate_tool_reading_logged",
  "climate_tool_reading_removed",
] as const;

export type ClimateToolAnalyticsEvent = (typeof CLIMATE_TOOL_ANALYTICS_EVENTS)[number];

export const CLIMATE_TOOL_CTA_LOCATIONS = ["tool", "article", "footer"] as const;
export type ClimateToolCtaLocation = (typeof CLIMATE_TOOL_CTA_LOCATIONS)[number];

export const CLIMATE_TOOL_PROBLEMS = ["rh_high", "rh_low", "temp_high", "temp_low"] as const;
export type ClimateToolProblem = (typeof CLIMATE_TOOL_PROBLEMS)[number];

const STATUSES: readonly GrowTentBandStatusCode[] = ["below", "in_band", "above"];
const STAGE_IDS: readonly string[] = PUBLIC_VPD_CHART_STAGES.map((stage) => stage.id);

export interface ClimateToolAnalyticsParams {
  reading_count?: number;
  stage?: PublicVpdChartStageId;
  status?: GrowTentBandStatusCode;
  problem?: ClimateToolProblem;
  cta_location?: ClimateToolCtaLocation;
}

export function sanitizeClimateToolAnalyticsParams(
  params?: ClimateToolAnalyticsParams,
): ClimateToolAnalyticsParams {
  if (!params) return {};
  const safe: ClimateToolAnalyticsParams = {};
  if (typeof params.reading_count === "number" && Number.isFinite(params.reading_count)) {
    safe.reading_count = params.reading_count;
  }
  if (params.stage && STAGE_IDS.includes(params.stage)) safe.stage = params.stage;
  if (params.status && STATUSES.includes(params.status)) safe.status = params.status;
  if (params.problem && CLIMATE_TOOL_PROBLEMS.includes(params.problem)) {
    safe.problem = params.problem;
  }
  if (params.cta_location && CLIMATE_TOOL_CTA_LOCATIONS.includes(params.cta_location)) {
    safe.cta_location = params.cta_location;
  }
  return safe;
}

export function trackClimateToolEvent(
  name: ClimateToolAnalyticsEvent,
  params?: ClimateToolAnalyticsParams,
): void {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;
  const safe = sanitizeClimateToolAnalyticsParams(params);
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

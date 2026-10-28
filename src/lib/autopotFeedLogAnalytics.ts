/**
 * Consent-gated events for the public AutoPot reservoir & feed log.
 * Integer counters and fixed enums only. Never grower text or readings.
 */

import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const AUTOPOT_LOG_ANALYTICS_EVENTS = [
  "autopot_log_clear",
  "autopot_log_copy",
  "autopot_log_cta_click",
  "autopot_log_export_csv",
  "autopot_log_plan_compared",
  "autopot_log_print",
  "autopot_log_refill_added",
  "autopot_log_refill_deleted",
  "autopot_log_source_click",
  "autopot_log_system_selected",
  "autopot_log_unit_selected",
] as const;

export type AutopotLogAnalyticsEvent = (typeof AUTOPOT_LOG_ANALYTICS_EVENTS)[number];

export const AUTOPOT_LOG_CTA_LOCATIONS = ["tool", "article", "footer"] as const;
export type AutopotLogCtaLocation = (typeof AUTOPOT_LOG_CTA_LOCATIONS)[number];

const SYSTEMS = ["classic", "tray2grow", "other"] as const;
const UNITS = ["ms_cm", "us_cm", "ppm500", "ppm700"] as const;
const SOURCES = ["autopot", "stash"] as const;

export interface AutopotLogAnalyticsParams {
  refill_count?: number;
  compared_count?: number;
  system?: (typeof SYSTEMS)[number];
  unit?: (typeof UNITS)[number];
  source?: (typeof SOURCES)[number];
  cta_location?: AutopotLogCtaLocation;
}

const INT_KEYS = ["refill_count", "compared_count"] as const;

function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : undefined;
}

export function sanitizeAutopotLogAnalyticsParams(
  params?: AutopotLogAnalyticsParams,
): AutopotLogAnalyticsParams {
  if (!params) return {};
  const safe: AutopotLogAnalyticsParams = {};
  for (const key of INT_KEYS) {
    const value = params[key];
    if (typeof value === "number" && Number.isInteger(value)) safe[key] = value;
  }
  const system = pick(SYSTEMS, params.system);
  const unit = pick(UNITS, params.unit);
  const source = pick(SOURCES, params.source);
  const cta = pick(AUTOPOT_LOG_CTA_LOCATIONS, params.cta_location);
  if (system) safe.system = system;
  if (unit) safe.unit = unit;
  if (source) safe.source = source;
  if (cta) safe.cta_location = cta;
  return safe;
}

export function trackAutopotLogEvent(
  name: AutopotLogAnalyticsEvent,
  params?: AutopotLogAnalyticsParams,
): void {
  if (typeof window === "undefined") return;
  if (readAnalyticsConsent() !== "granted") return;
  const safe = sanitizeAutopotLogAnalyticsParams(params);
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

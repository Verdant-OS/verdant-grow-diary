/**
 * Funnel analytics — the ten growth-calendar conversion events:
 *
 *   signup → tent_created → plant_created → quick_log_saved →
 *   csv_import_completed → csv_history_ai_doctor_clicked →
 *   historical_ai_review_started → paywall_viewed → checkout_started →
 *   subscription_activated
 *
 * Design constraints (grower-privacy first):
 *  - Fire-and-forget: never throws, never blocks a save/checkout path,
 *    no-ops when gtag is absent (ad blockers, tests, SSR-like envs).
 *  - Structural param allowlist: only the keys below, only primitive
 *    values, and string values must be short enum-like tokens — free
 *    text (notes, nicknames, emails) cannot pass through this module.
 *  - No user ids, plant ids, or any row identifiers, ever.
 *  - Every event is mirrored onto the existing `verdant:analytics`
 *    CustomEvent bridge (see pricingAnalytics.ts) so a future provider
 *    can subscribe without touching the call sites.
 */

import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

export const FUNNEL_EVENTS = [
  "signup",
  "tent_created",
  "plant_created",
  "quick_log_saved",
  "csv_import_completed",
  "csv_history_ai_doctor_clicked",
  "historical_ai_review_started",
  "paywall_viewed",
  "checkout_started",
  "subscription_activated",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

/**
 * The only param keys that ever reach the tracker. Everything else is
 * dropped silently — call sites cannot widen this surface by accident.
 */
export const FUNNEL_PARAM_KEYS = [
  /** Which paywall rendered: "pricing" | "upgrade" | "ai_doctor_limit". */
  "surface",
  /** Plan slug the grower acted on (enum like "pro-monthly"), never input. */
  "plan",
  /** Signup method (e.g. "email"). */
  "method",
  /** Privacy-safe Quick Log success enum; never grower content. */
  "event_type",
  /** csv_import_completed inserted-row count. */
  "rows",
] as const;

type FunnelParamKey = (typeof FUNNEL_PARAM_KEYS)[number];

export type FunnelEventParams = Partial<Record<FunnelParamKey, string | number | boolean>>;

/**
 * Enum-like strings only: short, no whitespace. Anything that looks like
 * free text is dropped rather than truncated — a partial note is still a
 * leak.
 */
const MAX_STRING_PARAM_LENGTH = 32;

export function sanitizeFunnelParams(
  params?: FunnelEventParams,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!params) return out;
  for (const key of FUNNEL_PARAM_KEYS) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_STRING_PARAM_LENGTH &&
      !/\s/.test(value)
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function trackFunnelEvent(name: FunnelEventName, params?: FunnelEventParams): void {
  if (typeof window === "undefined") return;
  const safe = sanitizeFunnelParams(params);
  try {
    const g = (window as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof g === "function") g("event", name, safe);
  } catch {
    // Analytics must never break the product.
  }
  try {
    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, {
        detail: { name, props: safe },
      }),
    );
  } catch {
    // Same.
  }
}

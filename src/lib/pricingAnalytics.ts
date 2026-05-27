/**
 * Lightweight analytics shim for the public pricing page.
 *
 * No third-party tracker is wired up yet, so this helper only dispatches a
 * `verdant:analytics` CustomEvent on `window` (when available). A future
 * analytics provider can listen for that event without us having to touch
 * the pricing UI. Pure, side-effect-light, and safe to call during render
 * handlers.
 */

export const PRICING_ANALYTICS_EVENT = "verdant:analytics" as const;

export type PricingAnalyticsName =
  | "pricing_page_view"
  | "pricing_cta_free_clicked"
  | "pricing_cta_pro_monthly_clicked"
  | "pricing_cta_pro_annual_clicked"
  | "pricing_cta_founder_lifetime_clicked"
  | "pricing_faq_opened";

export interface PricingAnalyticsPayload {
  name: PricingAnalyticsName;
  props?: Record<string, string | number | boolean | null>;
}

export function trackPricingEvent(
  name: PricingAnalyticsName,
  props?: PricingAnalyticsPayload["props"],
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<PricingAnalyticsPayload>(PRICING_ANALYTICS_EVENT, {
        detail: { name, props },
      }),
    );
  } catch {
    /* analytics must never break the UI */
  }
}

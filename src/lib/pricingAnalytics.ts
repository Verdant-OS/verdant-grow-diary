/**
 * Lightweight analytics helper for the pricing page.
 *
 * If the host app wires a real analytics provider later, this acts as the
 * single integration point. Until then it safely no-ops.
 */

export type PricingEvent =
  | "pricing_page_view"
  | "pricing_cta_free_clicked"
  | "pricing_cta_pro_monthly_clicked"
  | "pricing_cta_pro_annual_clicked"
  | "pricing_cta_founder_lifetime_clicked"
  | "pricing_faq_opened";

export function trackPricingEvent(event: PricingEvent): void {
  try {
    if (
      typeof window !== "undefined" &&
      typeof (window as Window & { gtag?: (...args: unknown[]) => void }).gtag === "function"
    ) {
      (window as Window & { gtag?: (...args: unknown[]) => void }).gtag!("event", event);
    }
  } catch {
    // Analytics must never break the page.
  }
}

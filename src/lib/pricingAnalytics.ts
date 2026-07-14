/**
 * Lightweight analytics shim for the public pricing page.
 *
 * Dispatches the internal `verdant:analytics` CustomEvent and, when the
 * existing Google Analytics tag is available, forwards the same PII-free
 * event to gtag. Analytics failures must never block pricing or checkout.
 */

export const PRICING_ANALYTICS_EVENT = "verdant:analytics" as const;

export type PricingAnalyticsName =
  | "context_check_page_view"
  | "context_check_completed"
  | "context_check_reset"
  | "context_check_pricing_clicked"
  | "context_check_signup_clicked"
  | "context_check_share_clicked"
  | "context_check_share_completed"
  | "context_check_share_failed"
  | "grower_invite_page_view"
  | "grower_invite_share_clicked"
  | "grower_invite_share_completed"
  | "grower_invite_share_failed"
  | "founder_checkout_cta_clicked"
  | "founder_page_view"
  | "founder_share_clicked"
  | "founder_share_completed"
  | "founder_share_failed"
  | "founder_start_free_clicked"
  | "landing_pricing_cta_clicked"
  | "landing_signup_cta_clicked"
  | "signup_page_view"
  | "signup_started"
  | "signup_completed"
  | "signup_failed"
  | "pricing_page_view"
  | "pricing_billing_toggle"
  | "pricing_cta_free_clicked"
  | "pricing_cta_pro_monthly_clicked"
  | "pricing_cta_pro_annual_clicked"
  | "pricing_cta_founder_lifetime_clicked"
  | "pricing_founder_details_clicked"
  | "pricing_faq_opened"
  | "pricing_checkout_blocked"
  | "pricing_interest_submitted"
  | "pricing_interest_submit_failed"
  | "pricing_interest_share_clicked"
  | "pricing_interest_share_completed"
  | "pricing_interest_share_failed";

export interface PricingAnalyticsProps {
  item?: string;
  period?: string;
  plan?: string;
  reason?: string;
  source?: string;
}

export interface PricingAnalyticsPayload {
  name: PricingAnalyticsName;
  props?: PricingAnalyticsProps;
}

const ALLOWED_PROP_KEYS = new Set<keyof PricingAnalyticsProps>([
  "item",
  "period",
  "plan",
  "reason",
  "source",
]);

function sanitizeProps(props: unknown): PricingAnalyticsProps | undefined {
  if (!props || typeof props !== "object" || Array.isArray(props)) return undefined;

  const sanitized: PricingAnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (!ALLOWED_PROP_KEYS.has(key as keyof PricingAnalyticsProps)) continue;
    if (typeof value !== "string") continue;
    sanitized[key as keyof PricingAnalyticsProps] = value.slice(0, 120);
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function trackPricingEvent(name: PricingAnalyticsName, props?: PricingAnalyticsProps): void {
  if (typeof window === "undefined") return;
  const safeProps = sanitizeProps(props);
  try {
    window.dispatchEvent(
      new CustomEvent<PricingAnalyticsPayload>(PRICING_ANALYTICS_EVENT, {
        detail: { name, props: safeProps },
      }),
    );
  } catch {
    /* analytics must never break the UI */
  }

  try {
    const gtag = (
      window as Window & {
        gtag?: (command: "event", eventName: string, params?: PricingAnalyticsProps) => void;
      }
    ).gtag;
    if (typeof gtag === "function") {
      gtag("event", name, safeProps);
    }
  } catch {
    /* analytics must never break the UI */
  }
}

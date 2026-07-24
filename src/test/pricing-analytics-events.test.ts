import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRICING_ANALYTICS_EVENT,
  trackPricingEvent,
  type PricingAnalyticsPayload,
} from "@/lib/pricingAnalytics";

afterEach(() => {
  delete (window as Window & { gtag?: unknown }).gtag;
});

describe("pricing analytics events", () => {
  it("forwards the PII-free event to both Verdant and the existing gtag", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag?: typeof gtag }).gtag = gtag;
    const received: PricingAnalyticsPayload[] = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<PricingAnalyticsPayload>).detail);
    };
    window.addEventListener(PRICING_ANALYTICS_EVENT, listener);

    trackPricingEvent("pricing_interest_submitted", {
      plan: "pro_annual",
      source: "pricing_interest",
      email: "grower@example.com",
    } as never);

    window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
    expect(received).toEqual([
      {
        name: "pricing_interest_submitted",
        props: { plan: "pro_annual", source: "pricing_interest" },
      },
    ]);
    expect(gtag).toHaveBeenCalledWith("event", "pricing_interest_submitted", {
      plan: "pro_annual",
      source: "pricing_interest",
    });
  });

  it("never lets a broken analytics provider break the pricing UI", () => {
    (window as unknown as { gtag?: () => void }).gtag = () => {
      throw new Error("tracker unavailable");
    };

    expect(() =>
      trackPricingEvent("pricing_checkout_blocked", { plan: "pro_monthly" }),
    ).not.toThrow();
  });
});

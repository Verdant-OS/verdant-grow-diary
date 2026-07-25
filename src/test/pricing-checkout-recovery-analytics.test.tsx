/**
 * Pricing recovery analytics — unit coverage for blocked checkout and each
 * recovery action (dismiss, choose another plan, retry).
 *
 * Guards the exact events emitted from src/pages/Pricing.tsx:
 *   - blocked checkout   -> pricing_checkout_blocked (runtime_failure)
 *   - retry              -> pricing_checkout_recovery_retry + checkout_recovery_retry
 *   - choose another     -> pricing_checkout_recovery_choose_another_plan + funnel
 *   - dismiss            -> pricing_checkout_recovery_dismissed + funnel
 *
 * Both trackers must fire with `plan` carrying the last CTA plan the grower
 * clicked, and the pricing tracker must include `source: "recovery_panel"`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const trackPricingEventMock = vi.fn();
const trackFunnelEventMock = vi.fn();
const openCheckoutMock = vi.fn(async () => {});
const dismissBlockedMock = vi.fn();

vi.mock("@/lib/pricingAnalytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pricingAnalytics")>(
    "@/lib/pricingAnalytics",
  );
  return {
    ...actual,
    trackPricingEvent: (...args: unknown[]) => trackPricingEventMock(...args),
  };
});

vi.mock("@/lib/funnelAnalytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/funnelAnalytics")>(
    "@/lib/funnelAnalytics",
  );
  return {
    ...actual,
    trackFunnelEvent: (...args: unknown[]) => trackFunnelEventMock(...args),
  };
});

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutMock,
    loading: false,
    environment: "sandbox" as const,
    unavailableMessage: null,
    blockedReason:
      "Checkout couldn't open. You can leave your email for one availability notice instead.",
    dismissBlocked: dismissBlockedMock,
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

vi.mock("@/hooks/useFounderSlotsRemaining", () => ({
  useFounderSlotsRemaining: () => ({
    status: "ready" as const,
    remaining: 25,
    total: 100,
    claimed: 75,
    soldOut: false,
  }),
}));

vi.mock("@/components/SubscriberInterestForm", () => ({
  default: () => null,
}));

import Pricing from "@/pages/Pricing";

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  trackPricingEventMock.mockReset();
  trackFunnelEventMock.mockReset();
  openCheckoutMock.mockReset();
  dismissBlockedMock.mockReset();
});

describe("Pricing recovery analytics", () => {
  it("emits pricing_checkout_blocked on mount when the checkout is blocked", () => {
    renderPricing();
    const blockedCalls = trackPricingEventMock.mock.calls.filter(
      (call) => call[0] === "pricing_checkout_blocked",
    );
    expect(blockedCalls.length).toBeGreaterThanOrEqual(1);
    expect(blockedCalls[0][1]).toMatchObject({ reason: "runtime_failure" });
  });

  it("clicking a paid CTA while blocked emits pricing_checkout_blocked with the plan and does not open checkout", () => {
    renderPricing();
    trackPricingEventMock.mockClear();

    // Any paid CTA — pick the annual Pro card CTA, which routes to pro_annual.
    const proCta = screen.getByTestId("pricing-cta-pro_annual");
    fireEvent.click(proCta);

    const blockedCalls = trackPricingEventMock.mock.calls.filter(
      (call) => call[0] === "pricing_checkout_blocked",
    );
    expect(blockedCalls.length).toBe(1);
    expect(blockedCalls[0][1]).toMatchObject({
      plan: "pro_annual",
      source: "plan_card",
      reason: "runtime_failure",
    });
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });

  it("retry button fires pricing + funnel recovery_retry with the last-clicked plan, then reopens checkout", () => {
    renderPricing();

    // Set lastCheckoutPlanRef via a CTA click first.
    fireEvent.click(screen.getByTestId("pricing-cta-pro_monthly"));
    trackPricingEventMock.mockClear();
    trackFunnelEventMock.mockClear();

    fireEvent.click(screen.getByTestId("pricing-checkout-retry"));

    expect(trackPricingEventMock).toHaveBeenCalledWith(
      "pricing_checkout_recovery_retry",
      { plan: "pro_monthly", source: "recovery_panel" },
    );
    expect(trackFunnelEventMock).toHaveBeenCalledWith(
      "checkout_recovery_retry",
      { plan: "pro_monthly" },
    );
    expect(dismissBlockedMock).toHaveBeenCalledTimes(1);
    expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "pro_monthly" });
  });

  it("choose-another-plan button fires pricing + funnel recovery_choose_another_plan", () => {
    renderPricing();
    fireEvent.click(screen.getByTestId("pricing-cta-pro_annual"));
    trackPricingEventMock.mockClear();
    trackFunnelEventMock.mockClear();

    fireEvent.click(screen.getByTestId("pricing-checkout-choose-another-plan"));

    expect(trackPricingEventMock).toHaveBeenCalledWith(
      "pricing_checkout_recovery_choose_another_plan",
      { plan: "pro_annual", source: "recovery_panel" },
    );
    expect(trackFunnelEventMock).toHaveBeenCalledWith(
      "checkout_recovery_choose_another_plan",
      { plan: "pro_annual" },
    );
    expect(dismissBlockedMock).toHaveBeenCalledTimes(1);
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });

  it("dismiss button fires pricing + funnel recovery_dismissed", () => {
    renderPricing();
    fireEvent.click(screen.getByTestId("pricing-cta-founder_lifetime"));
    trackPricingEventMock.mockClear();
    trackFunnelEventMock.mockClear();

    fireEvent.click(screen.getByTestId("pricing-checkout-dismiss"));

    expect(trackPricingEventMock).toHaveBeenCalledWith(
      "pricing_checkout_recovery_dismissed",
      { plan: "founder_lifetime", source: "recovery_panel" },
    );
    expect(trackFunnelEventMock).toHaveBeenCalledWith(
      "checkout_recovery_dismissed",
      { plan: "founder_lifetime" },
    );
    expect(dismissBlockedMock).toHaveBeenCalledTimes(1);
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });
});

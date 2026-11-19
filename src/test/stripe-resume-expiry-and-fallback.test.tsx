/**
 * Resume uses consumePlanIntent's freshness check, and a Stripe
 * not-configured resume opens Paddle the same way a signed-in click does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  CHECKOUT_PLAN_INTENT_STORAGE_KEY,
  DEFAULT_PLAN_INTENT_MAX_AGE_MS,
  savePlanIntent,
} from "@/lib/checkoutPlanIntent";

const authState = { user: null as { id: string } | null, loading: false };
const openCheckoutMock = vi.fn();
const requestMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/config/checkoutProvider", () => ({
  PRO_CHECKOUT_PROVIDER: "stripe",
  resolveProCheckoutProvider: (raw: unknown) => (raw === "stripe" ? "stripe" : "paddle"),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading, signOut: vi.fn() }),
}));
vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutMock,
    loading: false,
    environment: "live",
    unavailable: false,
    unavailableMessage: null,
    blockedReason: null,
    blockedReasonCode: null,
    blockedScope: null,
    dismissBlocked: vi.fn(),
  }),
}));
vi.mock("@/lib/stripeCheckoutService", () => ({
  requestStripeCheckout: (...args: unknown[]) => requestMock(...args),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/checkoutContextRules", () => ({
  markCheckoutStarted: vi.fn(),
  clearCheckoutStarted: vi.fn(),
}));

import Pricing from "@/pages/Pricing";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";

describe("Stripe resume expiry and fallback", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    authState.user = { id: "user-1" };
    authState.loading = false;
    openCheckoutMock.mockReset();
    requestMock.mockReset();
    toastMock.mockReset();
    requestMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn(), search: "" },
    });
  });

  it("does not resume an expired Pro intent", async () => {
    window.sessionStorage.setItem(
      CHECKOUT_PLAN_INTENT_STORAGE_KEY,
      JSON.stringify({
        plan: "pro_annual",
        savedAt: Date.now() - DEFAULT_PLAN_INTENT_MAX_AGE_MS - 1,
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    renderHook(() => useStripeCheckout(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(requestMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("opens Paddle when a resumed Stripe start is not configured", async () => {
    requestMock.mockResolvedValue({ ok: false, code: "stripe_not_configured", status: 503 });
    savePlanIntent("pro_monthly");
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );
    await waitFor(() => expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "pro_monthly" }));
    expect(toastMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("pricing-cta-pro-annual")).toBeInTheDocument();
  });
});

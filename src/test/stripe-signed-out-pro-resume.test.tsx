/**
 * VITE_PRO_CHECKOUT_PROVIDER=stripe: a signed-out Pro click goes to /auth
 * and the saved plan resumes into Stripe after sign-in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { CHECKOUT_PLAN_INTENT_STORAGE_KEY, savePlanIntent } from "@/lib/checkoutPlanIntent";

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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

describe("Stripe provider signed-out Pro", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    authState.user = null;
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

  it("routes the click to auth and keeps the plan for resume", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <LocationProbe />
        <Pricing />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(screen.getByTestId("loc").textContent).toContain("/auth?");
    expect(screen.getByTestId("loc").textContent).toContain("redirectTo");
    expect(window.sessionStorage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toContain("pro_annual");
    expect(openCheckoutMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("resumes the saved Pro plan into Stripe after sign-in", async () => {
    authState.user = { id: "user-1" };
    savePlanIntent("pro_annual");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    );
    renderHook(() => useStripeCheckout(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(requestMock).toHaveBeenCalledWith("pro_annual");
    expect(window.sessionStorage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });

  it("does not toast when a settled signed-out caller starts checkout", async () => {
    const { result } = renderHook(() => useStripeCheckout());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.startStripeCheckout("pro_monthly");
    });
    expect(outcome).toBe("auth");
    expect(requestMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});

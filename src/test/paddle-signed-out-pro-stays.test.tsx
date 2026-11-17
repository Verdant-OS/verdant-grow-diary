/**
 * Default provider stays Paddle: a signed-out Pro click opens the Paddle
 * checkout path and does not call Stripe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";

const openCheckoutMock = vi.fn();
const startStripeCheckoutMock = vi.fn();

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
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
vi.mock("@/hooks/useStripeCheckout", () => ({
  useStripeCheckout: () => ({
    startStripeCheckout: startStripeCheckoutMock,
    loading: false,
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

import Pricing from "@/pages/Pricing";
import { PRO_CHECKOUT_PROVIDER } from "@/config/checkoutProvider";

describe("Paddle default signed-out Pro", () => {
  beforeEach(() => {
    openCheckoutMock.mockReset();
    startStripeCheckoutMock.mockReset();
  });

  it("opens Paddle and does not start Stripe", async () => {
    expect(PRO_CHECKOUT_PROVIDER).toBe("paddle");
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "pro_annual" });
    expect(startStripeCheckoutMock).not.toHaveBeenCalled();
  });
});

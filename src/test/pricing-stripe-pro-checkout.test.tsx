/**
 * /pricing with the provider switch on "stripe" (Cheek, 2026-11-12): Pro CTAs
 * start the Stripe checkout, never the Paddle overlay, and Paddle's own
 * blocked or unavailable state does not relabel or block Pro. Credit packs
 * stay on Paddle. The Paddle Pro path is covered by the files that pin the
 * switch to "paddle".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import Pricing from "@/pages/Pricing";
import { PRO_CHECKOUT_PROVIDER } from "@/config/checkoutProvider";

const openCheckoutMock = vi.fn();
const startStripeCheckoutMock = vi.fn();
const paddleState = { unavailableMessage: null as string | null };

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutMock,
    loading: false,
    environment: "live",
    unavailable: paddleState.unavailableMessage !== null,
    unavailableMessage: paddleState.unavailableMessage,
    blockedReason: null,
    blockedReasonCode: null,
    blockedScope: null,
    dismissBlocked: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStripeCheckout", () => ({
  useStripeCheckout: () => ({ startStripeCheckout: startStripeCheckoutMock, loading: false }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("/pricing sends new Pro sales to Stripe", () => {
  beforeEach(() => {
    openCheckoutMock.mockReset();
    startStripeCheckoutMock.mockReset();
    paddleState.unavailableMessage = null;
  });

  it("ships with the switch on Stripe", () => {
    expect(PRO_CHECKOUT_PROVIDER).toBe("stripe");
  });

  it("Pro Annual starts the Stripe checkout and never opens Paddle", async () => {
    const user = userEvent.setup();
    renderPricing();
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(startStripeCheckoutMock).toHaveBeenCalledWith("pro_annual");
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });

  it("Pro Monthly starts the Stripe checkout and never opens Paddle", async () => {
    const user = userEvent.setup();
    renderPricing();
    await user.click(screen.getByTestId("billing-toggle"));
    await user.click(screen.getByTestId("pricing-cta-pro-monthly"));
    expect(startStripeCheckoutMock).toHaveBeenCalledWith("pro_monthly");
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });

  it("keeps Pro purchasable through Stripe while Paddle is unavailable", async () => {
    paddleState.unavailableMessage = "Checkout is paused.";
    const user = userEvent.setup();
    renderPricing();
    const cta = screen.getByTestId("pricing-cta-pro-annual");
    expect(cta).toHaveTextContent(/Upgrade to Pro/);
    expect(cta).not.toHaveTextContent(/launch list/i);
    await user.click(cta);
    expect(startStripeCheckoutMock).toHaveBeenCalledWith("pro_annual");
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });
});

/**
 * /pricing in a build with VITE_PRO_CHECKOUT_PROVIDER=stripe (Cheek's pick,
 * 2026-11-12): Pro CTAs start the Stripe checkout, never the Paddle overlay,
 * and Paddle's own blocked or unavailable state does not relabel or block
 * Pro. If the server says Stripe is not set up, the same click falls back to
 * Paddle. The Pro button stays disabled while the browser leaves for Stripe.
 * Credit packs stay on Paddle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import Pricing from "@/pages/Pricing";

const openCheckoutMock = vi.fn();
const startStripeCheckoutMock = vi.fn();
const paddleState = { unavailableMessage: null as string | null };
const stripeState = { loading: false };

vi.mock("@/config/checkoutProvider", () => ({
  PRO_CHECKOUT_PROVIDER: "stripe",
  resolveProCheckoutProvider: (raw: unknown) => (raw === "stripe" ? "stripe" : "paddle"),
}));

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
  useStripeCheckout: () => ({
    startStripeCheckout: startStripeCheckoutMock,
    loading: stripeState.loading,
  }),
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

describe("/pricing sends new Pro sales to Stripe when the flag is on", () => {
  beforeEach(() => {
    openCheckoutMock.mockReset();
    startStripeCheckoutMock.mockReset();
    startStripeCheckoutMock.mockResolvedValue("redirecting");
    paddleState.unavailableMessage = null;
    stripeState.loading = false;
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

  it("falls back to Paddle on the same click when Stripe is not set up", async () => {
    startStripeCheckoutMock.mockResolvedValue("fallback");
    const user = userEvent.setup();
    renderPricing();
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    await waitFor(() => expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "pro_annual" }));
  });

  it("does not open Paddle after a real Stripe refusal", async () => {
    startStripeCheckoutMock.mockResolvedValue("failed");
    const user = userEvent.setup();
    renderPricing();
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    await waitFor(() => expect(startStripeCheckoutMock).toHaveBeenCalled());
    expect(openCheckoutMock).not.toHaveBeenCalled();
  });

  it("disables the Pro button while the Stripe checkout starts and redirects", () => {
    stripeState.loading = true;
    renderPricing();
    expect(screen.getByTestId("pricing-cta-pro-annual")).toBeDisabled();
  });
});

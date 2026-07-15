import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  track: vi.fn(),
  checkout: {
    environment: "unavailable" as "live" | "sandbox" | "unavailable",
    unavailable: true,
    unavailableMessage: "Checkout is still in test mode." as string | null,
    blockedReason: null as string | null,
  },
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: mocks.checkout.environment,
    unavailable: mocks.checkout.unavailable,
    unavailableMessage: mocks.checkout.unavailableMessage,
    blockedReason: mocks.checkout.blockedReason,
    dismissBlocked: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import Pricing from "@/pages/Pricing";

function renderPricing(initialEntry = "/pricing") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  mocks.track.mockReset();
  mocks.checkout.environment = "unavailable";
  mocks.checkout.unavailable = true;
  mocks.checkout.unavailableMessage = "Checkout is still in test mode.";
  mocks.checkout.blockedReason = null;
});

describe("Pricing checkout recovery", () => {
  it("shows an honest paid-interest path when checkout is unavailable", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-checkout-trust")).toHaveAttribute(
      "data-checkout-state",
      "unavailable",
    );
    expect(screen.getByTestId("pricing-checkout-trust")).toHaveTextContent("no charge is created");
    expect(screen.getByTestId("pricing-checkout-recovery")).toHaveTextContent(
      "Checkout is still in test mode.",
    );
    expect(screen.getByTestId("subscriber-interest-plan")).toHaveTextContent("Pro Annual");
    expect(screen.getByTestId("pricing-cta-pro-annual")).toHaveTextContent(
      "Join the Pro launch list",
    );
  });

  it("keeps paid intent instead of calling an unavailable checkout", async () => {
    const user = userEvent.setup();
    renderPricing();

    await user.click(screen.getByTestId("pricing-cta-founder-lifetime"));

    expect(mocks.openCheckout).not.toHaveBeenCalled();
    expect(screen.getByTestId("subscriber-interest-plan")).toHaveTextContent("Founder Lifetime");
    expect(mocks.track).toHaveBeenCalledWith("pricing_checkout_blocked", {
      plan: "founder_lifetime",
      source: "plan_card",
      reason: "environment_unavailable",
    });
  });

  it("hands fixed referral attribution to the lead boundary", () => {
    renderPricing(
      "/pricing?plan=pro_annual&utm_source=pricing_interest_share&utm_medium=referral&utm_campaign=paid_launch",
    );
    expect(screen.getByTestId("subscriber-interest-form")).toHaveAttribute(
      "data-lead-source",
      "pricing_interest_referral",
    );
  });

  it("keeps authenticated grower-invite attribution at the lead boundary", () => {
    renderPricing(
      "/pricing?utm_source=grower_invite&utm_medium=referral&utm_campaign=grower_invite",
    );
    expect(screen.getByTestId("subscriber-interest-form")).toHaveAttribute(
      "data-lead-source",
      "pricing_interest_grower_invite",
    );
  });

  it("keeps context-check attribution at the lead boundary", () => {
    renderPricing("/pricing?utm_source=context_check&utm_medium=owned&utm_campaign=context_check");
    expect(screen.getByTestId("subscriber-interest-form")).toHaveAttribute(
      "data-lead-source",
      "pricing_interest_context_check",
    );
  });

  it("does not retry checkout after a runtime failure", async () => {
    mocks.checkout.environment = "live";
    mocks.checkout.unavailable = false;
    mocks.checkout.unavailableMessage = null;
    mocks.checkout.blockedReason = "Checkout couldn't open.";
    const user = userEvent.setup();
    renderPricing();

    await user.click(screen.getByTestId("pricing-cta-founder-lifetime"));

    expect(mocks.openCheckout).not.toHaveBeenCalled();
    expect(screen.getByTestId("subscriber-interest-plan")).toHaveTextContent("Founder Lifetime");
    expect(mocks.track).toHaveBeenCalledWith("pricing_checkout_blocked", {
      plan: "founder_lifetime",
      source: "plan_card",
      reason: "runtime_failure",
    });
  });

  it("does not claim that interest is a reservation or subscription", () => {
    renderPricing();
    const recovery = screen.getByTestId("pricing-checkout-recovery");
    expect(recovery).toHaveTextContent("No SMS, automatic subscription");
    expect(recovery).toHaveTextContent("or reservation");
    expect(recovery.textContent).not.toMatch(/spot reserved|subscription active|payment complete/i);
  });
});

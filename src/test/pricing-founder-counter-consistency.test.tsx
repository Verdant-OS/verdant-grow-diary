import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  founderSlots: {
    status: "ready",
    remaining: 42,
    total: 75,
    claimed: 33,
    soldOut: false,
  },
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: "live",
    unavailableMessage: null,
    blockedReason: null,
  }),
}));

vi.mock("@/hooks/useFounderSlotsRemaining", () => ({
  useFounderSlotsRemaining: () => mocks.founderSlots,
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import Pricing from "@/pages/Pricing";

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  Object.assign(mocks.founderSlots, {
    status: "ready",
    remaining: 42,
    total: 75,
    claimed: 33,
    soldOut: false,
  });
});

describe("Pricing Founder counter consistency", () => {
  it("uses the same available count across the card and highlight CTA", async () => {
    const user = userEvent.setup();
    renderPricing();

    expect(screen.getByTestId("pricing-card-founder")).toHaveTextContent("33 of 75 claimed");
    expect(screen.getByTestId("pricing-cta-founder-lifetime")).toBeEnabled();
    expect(screen.getByTestId("pricing-cta-founder-highlight")).toBeEnabled();

    await user.click(screen.getByTestId("pricing-cta-founder-highlight"));
    expect(mocks.openCheckout).toHaveBeenCalledWith({ priceId: "founder_lifetime" });
  });

  it("disables and relabels both Founder CTAs when the validated count is sold out", async () => {
    Object.assign(mocks.founderSlots, {
      status: "ready",
      remaining: 0,
      total: 75,
      claimed: 75,
      soldOut: true,
    });
    const user = userEvent.setup();
    renderPricing();

    const planCta = screen.getByTestId("pricing-cta-founder-lifetime");
    const highlightCta = screen.getByTestId("pricing-cta-founder-highlight");
    expect(planCta).toBeDisabled();
    expect(highlightCta).toBeDisabled();
    expect(planCta).toHaveTextContent("Founder Lifetime sold out");
    expect(highlightCta).toHaveTextContent("Founder Lifetime sold out");
    expect(screen.getByTestId("pricing-card-founder")).toHaveTextContent("75 of 75 claimed");

    await user.click(highlightCta);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it("fails soft on unknown availability without inventing a count or sold-out state", () => {
    Object.assign(mocks.founderSlots, {
      status: "unknown",
      remaining: null,
      total: 75,
      claimed: null,
      soldOut: false,
    });
    renderPricing();

    const founderCard = screen.getByTestId("pricing-card-founder");
    expect(founderCard).toHaveTextContent("First 75 only");
    expect(founderCard).not.toHaveTextContent(/NaN|of 75 claimed|sold out/i);
    expect(screen.getByTestId("pricing-cta-founder-lifetime")).toBeEnabled();
    expect(screen.getByTestId("pricing-cta-founder-highlight")).toBeEnabled();
  });
});

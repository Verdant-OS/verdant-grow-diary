import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  founderSlots: {
    status: "ready",
    remaining: 42,
    total: 100,
    claimed: 58,
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

// Founder Lifetime left the public pricing grid; it now renders only on an
// explicit `?plan=founder_lifetime` deep link. These assertions still cover
// the Founder card exactly as before — they just have to arrive the way a
// grower with an existing Founder link does.
function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing?plan=founder_lifetime"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  Object.assign(mocks.founderSlots, {
    status: "ready",
    remaining: 42,
    total: 100,
    claimed: 58,
    soldOut: false,
  });
});

describe("Pricing Founder counter is not a sales surface", () => {
  it("does not render a Founder card, count, or checkout CTA on the deep link", async () => {
    renderPricing();
    expect(screen.queryByTestId("pricing-card-founder")).toBeNull();
    expect(screen.queryByTestId("pricing-cta-founder-lifetime")).toBeNull();
    expect(screen.queryByTestId("pricing-cta-founder-highlight")).toBeNull();
    expect(screen.queryByText(/of 100 claimed/i)).toBeNull();
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });
});

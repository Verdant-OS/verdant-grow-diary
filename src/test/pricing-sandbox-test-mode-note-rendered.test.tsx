/**
 * Rendered Pricing proof for the sandbox checkout test-mode note.
 *
 * usePaddleCheckout is mocked so the page reads checkoutEnvironment from
 * this harness. Sandbox must show the note. Live must not.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { SANDBOX_CHECKOUT_TEST_MODE_NOTE } from "@/lib/sandboxCheckoutTestModeNoteRules";

const checkout = vi.hoisted(() => ({
  environment: "sandbox" as "sandbox" | "live",
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: vi.fn(async () => {}),
    loading: false,
    environment: checkout.environment,
    unavailableMessage: null,
    blockedReason: null,
    blockedReasonCode: null,
    dismissBlocked: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import Pricing from "@/pages/Pricing";

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("Pricing sandbox checkout test-mode note", () => {
  beforeEach(() => {
    checkout.environment = "sandbox";
  });

  it("shows the note when checkout resolves to sandbox", () => {
    checkout.environment = "sandbox";
    renderPricing();
    expect(screen.getByTestId("sandbox-checkout-test-mode-note")).toHaveTextContent(
      SANDBOX_CHECKOUT_TEST_MODE_NOTE,
    );
  });

  it("hides the note when checkout resolves to live", () => {
    checkout.environment = "live";
    renderPricing();
    expect(screen.queryByTestId("sandbox-checkout-test-mode-note")).toBeNull();
  });
});

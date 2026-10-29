/**
 * #1994: FAQ expansion when location.hash updates via React Router navigation
 * (not only initial load or window hashchange).
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "@/lib/react-router-compat";
import { CHECKOUT_MECHANISM_FAQ_ANSWER } from "@/lib/checkoutTrustCopyRules";
import { CHECKOUT_LIVE_FAQ_ID } from "@/lib/sandboxCheckoutTestModeNoteRules";
import { SandboxCheckoutTestModeNote } from "@/components/SandboxCheckoutTestModeNote";

const checkout = vi.hoisted(() => ({
  environment: "sandbox" as "sandbox" | "live" | "unavailable",
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

function NavigateToCheckoutLiveFaqHash() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/pricing#${CHECKOUT_LIVE_FAQ_ID}`)}>
      Go to checkout-live FAQ hash
    </button>
  );
}

describe("Pricing checkout-live FAQ hash via router (#1994)", () => {
  beforeEach(() => {
    checkout.environment = "sandbox";
    window.history.replaceState(null, "", "/pricing");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("expands the checkout-live FAQ when client-side navigation sets location.hash", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <NavigateToCheckoutLiveFaqHash />
        <Pricing />
      </MemoryRouter>,
    );

    const faqItem = screen.getByTestId("pricing-faq-checkout-status");
    const trigger = within(faqItem).getByRole("button", { name: "Is checkout live?" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Go to checkout-live FAQ hash" }));
    });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(faqItem).toHaveTextContent(CHECKOUT_MECHANISM_FAQ_ANSWER);
  });

  it("invokes onCheckoutLiveClick from the sandbox note link on Pricing", () => {
    const onCheckoutLiveClick = vi.fn();
    render(
      <SandboxCheckoutTestModeNote
        environment="sandbox"
        onCheckoutLiveClick={onCheckoutLiveClick}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "Is checkout live?" }));
    expect(onCheckoutLiveClick).toHaveBeenCalledTimes(1);
  });
});

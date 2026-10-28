/**
 * The customer sandbox note stays, and links to the "Is checkout live?" FAQ.
 * #1994. Does not change when the note is shown.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { SandboxCheckoutTestModeNote } from "@/components/SandboxCheckoutTestModeNote";
import { SANDBOX_CHECKOUT_TEST_MODE_NOTE } from "@/lib/sandboxCheckoutTestModeNoteRules";

const CHECKOUT_LIVE_FAQ_HREF = "#pricing-faq-checkout-live";

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

describe("sandbox note link to the checkout FAQ", () => {
  beforeEach(() => {
    checkout.environment = "sandbox";
  });

  it("keeps the sandbox sentence and links it to the checkout FAQ", () => {
    render(<SandboxCheckoutTestModeNote environment="sandbox" />);
    const note = screen.getByTestId("sandbox-checkout-test-mode-note");
    expect(note).toHaveTextContent(SANDBOX_CHECKOUT_TEST_MODE_NOTE);
    const link = screen.getByRole("link", { name: "Is checkout live?" });
    expect(link).toHaveAttribute("href", CHECKOUT_LIVE_FAQ_HREF);
    expect(note).toContainElement(link);
  });

  it("points that link at the pricing FAQ item", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Pricing />
      </MemoryRouter>,
    );
    const faq = document.getElementById("pricing-faq-checkout-live");
    expect(faq).not.toBeNull();
    expect(faq).toHaveAttribute("data-testid", "pricing-faq-checkout-status");
    expect(faq).toHaveTextContent("Is checkout live?");
  });
});

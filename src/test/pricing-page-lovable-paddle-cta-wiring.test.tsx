/**
 * Pricing page — Lovable built-in Paddle CTA wiring.
 *
 * Phase 1 of the payments migration. Verifies:
 *  - all four tiers render with the expected prices
 *  - Pro Monthly / Pro Annual / Founder Lifetime CTAs invoke the new
 *    `usePaddleCheckout.openCheckout` with the correct human-readable
 *    price IDs (`pro_monthly`, `pro_annual`, `founder_lifetime`)
 *  - Free CTA opens the signup tab with fixed first-party attribution
 *  - the deprecated `/billing/...` CTA path is no longer visible as a
 *    competing user-facing checkout path
 *  - founder copy uses the "may close manually" language and does not
 *    fabricate urgency beyond the manual limit
 *  - forbidden marketing claims never appear
 *  - success and cancel copy match the product contract
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Pricing from "@/pages/Pricing";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancel from "@/pages/CheckoutCancel";

const openCheckoutMock = vi.fn();

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutMock,
    loading: false,
    environment: "live",
    unavailable: false,
    unavailableMessage: null,
    blockedReason: null,
    dismissBlocked: vi.fn(),
  }),
}));

// Stub SEO side-effects (document.head writes).
vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => {},
}));

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
}));

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("Pricing page — built-in Paddle wiring", () => {
  beforeEach(() => {
    openCheckoutMock.mockReset();
  });

  it("renders Free, Pro Monthly, Pro Annual, and Founder Lifetime with correct prices", () => {
    renderPricing();

    // Pro card defaults to annual toggle: $99 / year
    expect(screen.getByTestId("pricing-card-free")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-card-pro")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-card-founder")).toBeInTheDocument();

    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toMatch(/\$99/);
    const founderCard = screen.getByTestId("pricing-card-founder");
    expect(founderCard.textContent).toMatch(/\$129/);
  });

  it("labels the production purchase path as live and requires buyer review", async () => {
    const user = userEvent.setup();
    renderPricing();

    const trust = screen.getByTestId("pricing-checkout-trust");
    expect(trust).toHaveAttribute("data-checkout-state", "live");
    expect(trust).toHaveTextContent("Secure live checkout");
    expect(trust).toHaveTextContent("review the plan, price, and total");

    await user.click(screen.getByTestId("pricing-faq-checkout-status").querySelector("button")!);
    expect(screen.getByTestId("pricing-faq-checkout-status")).toHaveTextContent(
      "A charge happens only when Paddle confirms a real payment",
    );
    expect(screen.getByTestId("pricing-faq-checkout-status")).toHaveTextContent(
      "Verdant verifies that payment server-side",
    );
  });

  it("Pro Annual CTA opens checkout with priceId=pro_annual", async () => {
    const user = userEvent.setup();
    renderPricing();
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "pro_annual" });
  });

  it("Pro Monthly CTA opens checkout with priceId=pro_monthly", async () => {
    const user = userEvent.setup();
    renderPricing();
    // toggle to monthly
    await user.click(screen.getByTestId("billing-toggle"));
    await user.click(screen.getByTestId("pricing-cta-pro-monthly"));
    expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "pro_monthly" });
    // Pro Monthly displays $12 on the Pro card
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toMatch(/\$12/);
  });

  it("Founder Lifetime CTA opens checkout with priceId=founder_lifetime", async () => {
    const user = userEvent.setup();
    renderPricing();
    await user.click(screen.getByTestId("pricing-cta-founder-lifetime"));
    expect(openCheckoutMock).toHaveBeenCalledWith({ priceId: "founder_lifetime" });
  });

  it("Free CTA opens signup with fixed pricing-page attribution", () => {
    renderPricing();
    const freeCard = screen.getByTestId("pricing-card-free");
    const freeLink = freeCard.querySelector(
      'a[href="/auth?mode=signup&utm_source=pricing_page&utm_medium=owned&utm_campaign=paid_launch"]',
    );
    expect(freeLink).toBeTruthy();
  });

  it("Founder copy uses manual-close language, not fake countdown", () => {
    renderPricing();
    const founderCard = screen.getByTestId("pricing-card-founder");
    expect(founderCard.textContent).toMatch(/may close manually/i);
    // No timer / countdown UI
    expect(founderCard.textContent).not.toMatch(/expires in|countdown|timer|hurry/i);
  });

  it("no forbidden marketing claims appear", () => {
    renderPricing();
    const bodyText = document.body.textContent ?? "";
    const forbidden = [
      /autopilot/i,
      /ai grows for you/i,
      /guaranteed yield/i,
      /grows itself/i,
      /device control/i,
      /we sell your data/i,
      /buy cannabis/i,
      /buy weed/i,
    ];
    for (const rx of forbidden) {
      expect(bodyText).not.toMatch(rx);
    }
  });

  it("does not render competing user-facing /billing/pro-monthly or /billing/founder-lifetime CTAs", () => {
    renderPricing();
    // Slice F: `/billing/:plan` is now a compatibility redirect to
    // `/upgrade`; no visible pricing-page CTA should point at it.
    expect(document.querySelector('a[href="/billing/pro-monthly"]')).toBeNull();
    expect(document.querySelector('a[href="/billing/pro-annual"]')).toBeNull();
    expect(document.querySelector('a[href="/billing/founder-lifetime"]')).toBeNull();
  });
});

describe("Checkout success / cancel copy", () => {
  it("success page renders the pending confirmation copy by default (truth copy — no client-side grant)", () => {
    // Phase 2b truth copy: without a resolved active paid entitlement the
    // page must NOT overclaim "Pro is active". The confirmed heading only
    // appears once useMyEntitlements returns an active paid plan (covered
    // by src/test/checkout-success-entitlement-truth-copy.test.tsx).
    render(
      <MemoryRouter>
        <CheckoutSuccess />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("checkout-success-page")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-success-pending-heading")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-success-confirmed-heading")).toBeNull();
  });

  it("cancel page renders the no-charge copy", () => {
    render(
      <MemoryRouter>
        <CheckoutCancel />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("checkout-cancel-page")).toBeInTheDocument();
    expect(
      screen.getByText(/Checkout was not completed\. No charge was made\./),
    ).toBeInTheDocument();
  });
});

/**
 * React Testing Library tests for the Pricing page UI.
 *
 * Covers:
 * - All three pricing cards render from constants.
 * - Default billing state is Annual.
 * - Toggle switches Pro price between $99/year and $12/month.
 * - Pro card displays "Most Popular".
 * - Free card displays 3 AI Doctor credits per grow.
 * - Pro card displays 100 AI Doctor credits/month.
 * - Founder Lifetime card displays 100 AI Doctor credits/month and never says unlimited AI.
 * - Trust strip renders read-only / honest labels / no blind automation copy.
 * - Pricing constants are imported by the page.
 * - No Stripe, Supabase, fetch, functions.invoke, insert/update/upsert/delete/rpc calls.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Pricing from "@/pages/Pricing";
import { PRICING, AI_CREDIT_EXPLAINER, TRUST_STRIP } from "@/constants/pricing";

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

// Founder Lifetime left the public pricing grid; it now renders only on an
// explicit `?plan=founder_lifetime` deep link. MemoryRouter owns the entry so
// useSearchParams sees the plan preselect (BrowserRouter history tricks flaked).
function renderPricing({ founderDeepLink = false } = {}) {
  const entry = founderDeepLink ? "/pricing?plan=founder_lifetime" : "/pricing";
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("Pricing Page UI", () => {
  it("renders the public pricing cards from constants", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-card-free")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-card-pro")).toBeInTheDocument();
    // Founder Lifetime is retired from the public grid — see the deep-link
    // cases below, which still cover the card itself.
    expect(screen.queryByTestId("pricing-card-founder")).toBeNull();
  });

  it("still shows no Founder Lifetime card on an explicit deep link", () => {
    renderPricing({ founderDeepLink: true });
    expect(screen.queryByTestId("pricing-card-founder")).toBeNull();
    expect(screen.queryByText(/\$129/)).toBeNull();
  });

  it("default billing state is Annual", () => {
    renderPricing();
    const proPrice = screen.getByTestId("pricing-card-pro-price");
    expect(proPrice.textContent).toContain("$99");
    expect(proPrice.textContent).toContain("/ year");
  });

  it("toggle switches Pro price between $99/year and $12/month", () => {
    renderPricing();
    const toggle = screen.getByTestId("billing-toggle");
    const proPrice = screen.getByTestId("pricing-card-pro-price");

    expect(proPrice.textContent).toContain("$99");

    fireEvent.click(toggle);
    expect(proPrice.textContent).toContain("$12");
    expect(proPrice.textContent).toContain("/ month");

    fireEvent.click(toggle);
    expect(proPrice.textContent).toContain("$99");
    expect(proPrice.textContent).toContain("/ year");
  });

  it("Pro card displays Most Popular badge", () => {
    renderPricing();
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toContain("Most Popular");
  });

  it("Free card displays 3 AI Doctor credits per grow", () => {
    renderPricing();
    const freeCard = screen.getByTestId("pricing-card-free");
    expect(freeCard.textContent).toContain("3 AI Doctor credits per grow");
  });

  it("Pro card displays 100 AI Doctor credits/month", () => {
    renderPricing();
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toContain("100 AI Doctor credits / month");
  });

  it("a founder deep link does not render a Founder credit card", () => {
    renderPricing({ founderDeepLink: true });
    expect(screen.queryByTestId("pricing-card-founder")).toBeNull();
    expect(screen.queryByText(/Founder Lifetime/i)).toBeNull();
  });

  it("a founder deep link never says unlimited AI", () => {
    renderPricing({ founderDeepLink: true });
    expect(document.body.textContent?.toLowerCase()).not.toContain("unlimited ai");
  });

  it("trust strip renders read-only / honest labels / no blind automation copy", () => {
    renderPricing();
    const strip = screen.getByTestId("pricing-trust-strip");
    for (const item of TRUST_STRIP.items) {
      expect(strip.textContent).toContain(item);
    }
  });

  it("AI credit explainer renders all points from constants", () => {
    renderPricing();
    for (const point of AI_CREDIT_EXPLAINER.points) {
      expect(screen.getByText(point)).toBeInTheDocument();
    }
  });

  it("Free card price is $0", () => {
    renderPricing();
    const freePrice = screen.getByTestId("pricing-card-free-price");
    expect(freePrice.textContent).toContain("$0");
  });

  it("a founder deep link does not show a $129 Founder price", () => {
    renderPricing({ founderDeepLink: true });
    expect(screen.queryByText(/\$129/)).toBeNull();
  });

  it("annual savings footnote appears on default annual view", () => {
    renderPricing();
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toContain("31%");
  });
});

describe("Pricing constants completeness", () => {
  it("constants define Free, Pro and Craft, and not a Founder tier", () => {
    expect(PRICING.free.slug).toBe("free");
    expect(PRICING.pro.slug).toBe("pro");
    expect(PRICING.craft.slug).toBe("craft");
    expect(PRICING).not.toHaveProperty("founder");
  });

  it("Pro annual price is 99 and monthly is 12", () => {
    expect(PRICING.pro.annualPrice).toBe(99);
    expect(PRICING.pro.monthlyPrice).toBe(12);
  });

  it("historical Founder figures stay off the public PRICING object", () => {
    expect(PRICING).not.toHaveProperty("founder");
  });

  it("AI credit explainer does not claim unlimited AI", () => {
    const allText = AI_CREDIT_EXPLAINER.points.join(" ").toLowerCase();
    expect(allText).not.toContain("unlimited ai");
  });

  it("credit-pack note scopes the $9/$19 offer to the plans that can actually buy it", () => {
    // Regression: the note previously advertised "(50 for $9, 150 for $19)"
    // with no eligibility scoping, directly above a pack section whose
    // buttons are disabled for anonymous and free viewers (see
    // creditPackEligibility.ts / resolveCreditPackPurchaseGate). Free and
    // signed-out visitors read a price they could not act on.
    expect(AI_CREDIT_EXPLAINER.note).toContain("Pro and Craft");
    // The price-bearing sentence and the eligibility clause must be the
    // same sentence, not merely present somewhere in the note — otherwise
    // this assertion would pass for a note that re-introduces an
    // unscoped price mention elsewhere in the string.
    const priceSentence = AI_CREDIT_EXPLAINER.note
      .split(/(?<=[.!?])\s+/)
      .find((s) => s.includes("$9"));
    expect(priceSentence).toBeDefined();
    expect(priceSentence).toMatch(/Pro and Craft/);
    expect(priceSentence).not.toMatch(/Founder/);
  });
});

describe("Pricing page safety — no write paths", () => {
  it("constants file does not reference Stripe", () => {
    const mod = JSON.stringify(PRICING);
    expect(mod.toLowerCase()).not.toContain("stripe");
  });

  it("constants file does not reference supabase insert/update/delete", () => {
    const mod = JSON.stringify(PRICING);
    expect(mod.toLowerCase()).not.toContain("insert");
    expect(mod.toLowerCase()).not.toContain("update");
    expect(mod.toLowerCase()).not.toContain("delete");
    expect(mod.toLowerCase()).not.toContain("upsert");
    expect(mod.toLowerCase()).not.toContain("rpc");
  });
});

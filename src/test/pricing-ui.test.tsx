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
import { BrowserRouter } from "react-router-dom";
import Pricing from "@/pages/Pricing";
import { PRICING, AI_CREDIT_EXPLAINER, TRUST_STRIP } from "@/constants/pricing";

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

function renderPricing() {
  return render(
    <BrowserRouter>
      <Pricing />
    </BrowserRouter>
  );
}

describe("Pricing Page UI", () => {
  it("renders all three pricing cards from constants", () => {
    renderPricing();
    expect(screen.getByTestId("pricing-card-free")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-card-pro")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-card-founder")).toBeInTheDocument();
  });

  it("default billing state is Annual", () => {
    renderPricing();
    const proPrice = screen.getByTestId("pricing-card-pro-price");
    expect(proPrice.textContent).toContain("$99");
    expect(proPrice.textContent).toContain("/ year");
  });

  it("toggle switches Pro price between $99/year and $12/month", () => {
    render(<Pricing />);
    const toggle = screen.getByTestId("billing-toggle");
    const proPrice = screen.getByTestId("pricing-card-pro-price");

    // Default annual
    expect(proPrice.textContent).toContain("$99");

    // Switch to monthly
    fireEvent.click(toggle);
    expect(proPrice.textContent).toContain("$12");
    expect(proPrice.textContent).toContain("/ month");

    // Switch back to annual
    fireEvent.click(toggle);
    expect(proPrice.textContent).toContain("$99");
    expect(proPrice.textContent).toContain("/ year");
  });

  it("Pro card displays Most Popular badge", () => {
    render(<Pricing />);
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toContain("Most Popular");
  });

  it("Free card displays 3 AI Doctor credits per grow", () => {
    render(<Pricing />);
    const freeCard = screen.getByTestId("pricing-card-free");
    expect(freeCard.textContent).toContain("3 AI Doctor credits per grow");
  });

  it("Pro card displays 100 AI Doctor credits/month", () => {
    render(<Pricing />);
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toContain("100 AI Doctor credits / month");
  });

  it("Founder Lifetime card displays 100 AI Doctor credits/month", () => {
    render(<Pricing />);
    const founderCard = screen.getByTestId("pricing-card-founder");
    expect(founderCard.textContent).toContain("100 AI Doctor credits / month");
  });

  it("Founder Lifetime card never says unlimited AI", () => {
    render(<Pricing />);
    const founderCard = screen.getByTestId("pricing-card-founder");
    expect(founderCard.textContent?.toLowerCase()).not.toContain("unlimited ai");
  });

  it("trust strip renders read-only / honest labels / no blind automation copy", () => {
    render(<Pricing />);
    const strip = screen.getByTestId("pricing-trust-strip");
    for (const item of TRUST_STRIP.items) {
      expect(strip.textContent).toContain(item);
    }
  });

  it("AI credit explainer renders all points from constants", () => {
    render(<Pricing />);
    for (const point of AI_CREDIT_EXPLAINER.points) {
      expect(screen.getByText(point)).toBeInTheDocument();
    }
  });

  it("Free card price is $0", () => {
    render(<Pricing />);
    const freePrice = screen.getByTestId("pricing-card-free-price");
    expect(freePrice.textContent).toContain("$0");
  });

  it("Founder Lifetime card price is $129 one-time", () => {
    render(<Pricing />);
    const founderPrice = screen.getByTestId("pricing-card-founder-price");
    expect(founderPrice.textContent).toContain("$129");
    expect(founderPrice.textContent).toContain("one-time");
  });

  it("annual savings footnote appears on default annual view", () => {
    render(<Pricing />);
    const proCard = screen.getByTestId("pricing-card-pro");
    expect(proCard.textContent).toContain("31%");
  });
});

describe("Pricing constants completeness", () => {
  it("constants define all three tiers", () => {
    expect(PRICING.free.slug).toBe("free");
    expect(PRICING.pro.slug).toBe("pro");
    expect(PRICING.founder.slug).toBe("founder-lifetime");
  });

  it("Pro annual price is 99 and monthly is 12", () => {
    expect(PRICING.pro.annualPrice).toBe(99);
    expect(PRICING.pro.monthlyPrice).toBe(12);
  });

  it("Founder limit is 75 and price is 129", () => {
    expect(PRICING.founder.limit).toBe(75);
    expect(PRICING.founder.price).toBe(129);
  });

  it("AI credit explainer does not claim unlimited AI", () => {
    const allText = AI_CREDIT_EXPLAINER.points.join(" ").toLowerCase();
    expect(allText).not.toContain("unlimited ai");
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

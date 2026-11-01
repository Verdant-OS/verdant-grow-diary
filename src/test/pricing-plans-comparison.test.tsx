/**
 * The simple Pro vs Craft comparison table under the plan cards.
 *
 * Pinned here: the table renders, its prices are the same USD numbers the cards
 * above it show and follow the Monthly/Annual toggle, Craft-only capabilities
 * are marked not-included for Pro, and every row label / credit cell still
 * comes from PRICING's own feature lists (no second vocabulary).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Pricing from "@/pages/Pricing";
import { PRICING } from "@/constants/pricing";
import {
  buildPlansComparisonTable,
  CRAFT_ONLY_FEATURES,
  SHARED_PRO_FEATURES,
  PRO_CREDIT_FEATURE,
  CRAFT_CREDIT_FEATURE,
} from "@/lib/pricingPlansComparisonViewModel";

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: vi.fn(),
    loading: false,
    environment: "sandbox",
    unavailable: false,
    unavailableMessage: null,
    blockedReason: null,
    blockedReasonCode: null,
    blockedScope: null,
    dismissBlocked: vi.fn(),
    checkoutElement: null,
  }),
}));

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

function renderPricing(entry = "/pricing") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Pricing />
    </MemoryRouter>,
  );
}

function comparisonTable() {
  return screen.getByTestId("pricing-plans-comparison-table");
}

function columnHeader(key: "pro" | "craft") {
  return within(comparisonTable()).getByTestId(`pricing-plans-comparison-column-${key}`);
}

describe("Pricing — Pro vs Craft comparison table", () => {
  it("renders the table with Pro and Craft columns and a USD caption", () => {
    renderPricing();
    const section = screen.getByTestId("pricing-plans-comparison");
    expect(section.textContent).toContain("What Pro and Craft include");
    expect(section.textContent).toContain("Prices in USD");
    expect(comparisonTable().textContent).toContain("Pro");
    expect(comparisonTable().textContent).toContain("Craft");
  });

  it("shows the annual USD prices the cards show, by default", () => {
    renderPricing();
    expect(columnHeader("pro").textContent).toContain("$99");
    expect(columnHeader("pro").textContent).toContain("/ year");
    expect(columnHeader("craft").textContent).toContain("$249");
    expect(columnHeader("craft").textContent).toContain("/ year");
  });

  it("switches to the monthly USD prices when the toggle moves to Monthly", () => {
    renderPricing();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(columnHeader("pro").textContent).toContain("$12");
    expect(columnHeader("pro").textContent).toContain("/ month");
    expect(columnHeader("craft").textContent).toContain("$29");
    expect(columnHeader("craft").textContent).toContain("/ month");
  });

  it("never disagrees with the plan cards on the price", () => {
    renderPricing();
    const proCard = screen.getByTestId("pricing-card-pro").textContent ?? "";
    expect(columnHeader("pro").textContent).toContain(proCard.includes("$99") ? "$99" : "$12");
    const craftCard = screen.getByTestId("pricing-card-craft").textContent ?? "";
    expect(columnHeader("craft").textContent).toContain(
      craftCard.includes("$249") ? "$249" : "$29",
    );
  });

  it("marks the Blueprint and craft-only bands as Craft only", () => {
    renderPricing();
    const table = comparisonTable();
    for (const feature of CRAFT_ONLY_FEATURES) {
      const row = within(table)
        .getAllByRole("row")
        .find((r) => (r.textContent ?? "").includes(feature));
      expect(row, `missing row for ${feature}`).toBeTruthy();
      const cells = within(row!).getAllByRole("cell");
      expect(within(cells[1]).getByLabelText("Not included")).toBeInTheDocument();
      expect(within(cells[2]).getByLabelText("Included")).toBeInTheDocument();
    }
  });

  it("names the monthly AI Doctor allowance for each plan", () => {
    renderPricing();
    const row = within(comparisonTable())
      .getAllByRole("row")
      .find((r) => (r.textContent ?? "").includes("AI Doctor credits"));
    expect(row?.textContent).toContain(PRO_CREDIT_FEATURE);
    expect(row?.textContent).toContain(CRAFT_CREDIT_FEATURE);
  });

  it("keeps the retired Founder plan out of the table", () => {
    renderPricing();
    expect(comparisonTable().textContent).not.toContain("Founder");
  });

  it("only states capabilities PRICING's own feature lists carry", () => {
    for (const feature of CRAFT_ONLY_FEATURES) {
      expect(PRICING.craft.features).toContain(feature);
      expect(PRICING.pro.features).not.toContain(feature);
    }
    for (const feature of SHARED_PRO_FEATURES) {
      expect(PRICING.pro.features).toContain(feature);
    }
    expect(PRICING.pro.features).toContain(PRO_CREDIT_FEATURE);
    expect(PRICING.craft.features).toContain(CRAFT_CREDIT_FEATURE);
  });

  it("derives both price strings from the pricing constants", () => {
    const monthly = buildPlansComparisonTable("monthly");
    expect(monthly.columns.map((c) => `${c.price}${c.cadence}`)).toEqual([
      `$${PRICING.pro.monthlyPrice}/ month`,
      `$${PRICING.craft.monthlyPrice}/ month`,
    ]);
    const annual = buildPlansComparisonTable("annual");
    expect(annual.columns.map((c) => `${c.price}${c.cadence}`)).toEqual([
      `$${PRICING.pro.annualPrice}/ year`,
      `$${PRICING.craft.annualPrice}/ year`,
    ]);
  });
});

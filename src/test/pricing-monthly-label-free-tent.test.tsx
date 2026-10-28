/**
 * #2170 Monthly billing label and #2176 Free card tent limit.
 *
 * The Free card must state the same 1-tent limit the entitlements enforce.
 * Monthly must be a control that selects monthly billing.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PRICING } from "@/constants/pricing";
import Pricing from "@/pages/Pricing";

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

describe("pricing Free card tent limit (#2176)", () => {
  it("states 1 tent on the Free card", () => {
    expect(PRICING.free.features).toContain("1 tent");
    renderPricing();
    expect(screen.getByTestId("pricing-card-free")).toHaveTextContent("1 tent");
  });
});

describe("pricing Monthly billing label (#2170)", () => {
  it("selects monthly billing when Monthly is clicked", async () => {
    const user = userEvent.setup();
    renderPricing();
    const toggle = screen.getByTestId("billing-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const monthly = screen.getByRole("button", { name: "Monthly" });
    expect(monthly).toHaveAttribute("type", "button");
    expect(monthly.className).toContain("min-h-11");
    await user.click(monthly);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("pricing-card-pro-price")).toHaveTextContent("$12");
    expect(screen.getByTestId("pricing-card-pro-price")).toHaveTextContent("/ month");
  });
});

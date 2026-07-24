import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => track(...args),
}));

import CheckoutCancel from "@/pages/CheckoutCancel";

function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CheckoutCancel />
    </MemoryRouter>,
  );
}

beforeEach(() => track.mockReset());

describe("CheckoutCancel recovery page", () => {
  it("keeps the selected plan and safe return path without reopening checkout", async () => {
    const user = userEvent.setup();
    renderPage("/checkout/cancel?plan=pro_annual&returnTo=%2Fpheno-hunts%2Fnew");

    expect(screen.getByText(/Pro Annual choice is still selected/)).toBeInTheDocument();
    expect(screen.getByTestId("checkout-cancel-pricing-link")).toHaveAttribute(
      "href",
      "/pricing?plan=pro_annual&returnTo=%2Fpheno-hunts%2Fnew",
    );
    expect(screen.getByTestId("checkout-cancel-return-link")).toHaveAttribute(
      "href",
      "/pheno-hunts/new",
    );
    expect(track).toHaveBeenCalledWith("checkout_cancel_page_view", { plan: "pro_annual" });

    await user.click(screen.getByTestId("checkout-cancel-pricing-link"));
    expect(track).toHaveBeenCalledWith("checkout_cancel_pricing_clicked", {
      plan: "pro_annual",
    });
  });

  it("drops hostile query values and renders calm generic recovery", () => {
    renderPage("/checkout/cancel?plan=admin&returnTo=https%3A%2F%2Fevil.example");

    expect(screen.getByTestId("checkout-cancel-pricing-link")).toHaveAttribute("href", "/pricing");
    expect(screen.getByTestId("checkout-cancel-return-link")).toHaveAttribute("href", "/");
    expect(screen.getByText("Back to pricing")).toBeInTheDocument();
    expect(screen.getByText("Go to my grow")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("evil.example");
  });
});

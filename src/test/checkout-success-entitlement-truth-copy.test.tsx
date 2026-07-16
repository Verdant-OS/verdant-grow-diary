/**
 * Phase 2b — CheckoutSuccess truth-copy tests.
 *
 * Confirms:
 *  - "confirming" copy shown only with real checkout context (same-device
 *    marker or returnTo handoff) while the resolver is pending
 *  - a direct visit with no checkout context shows the no-context state and
 *    never claims a completed checkout
 *  - "Verdant Pro is active." shown only after resolver confirms an active
 *    paid plan
 *  - Refresh action present in both unconfirmed states
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import { CHECKOUT_STARTED_STORAGE_KEY, markCheckoutStarted } from "@/lib/checkoutContextRules";
import type { ResolvedEntitlement } from "@/lib/entitlements";

const mockEnt: { value: ResolvedEntitlement; loading: boolean } = {
  value: {
    effectivePlanId: "free",
    displayPlanId: "free",
    status: "active",
    isActive: true,
    capabilities: {} as unknown as ResolvedEntitlement["capabilities"],
    degraded: false,
    degradedReason: "null_row_free",
    isStaff: false,
    source: "free",
  },
  loading: false,
};

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: mockEnt.loading,
    entitlement: mockEnt.value,
    refetch: async () => undefined,
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));

function renderPage() {
  return render(
    <MemoryRouter>
      <CheckoutSuccess />
    </MemoryRouter>,
  );
}

describe("CheckoutSuccess truth copy", () => {
  beforeEach(() => {
    window.sessionStorage.removeItem(CHECKOUT_STARTED_STORAGE_KEY);
  });

  it("shows the no-context state on a direct visit — never claims a completed checkout", () => {
    mockEnt.value = {
      ...mockEnt.value,
      effectivePlanId: "free",
      isActive: true,
      displayPlanId: "free",
    };
    renderPage();
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute("data-confirmed", "false");
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute("data-view", "no_context");
    expect(screen.getByTestId("checkout-success-no-context-heading")).toHaveTextContent(
      /No recent checkout found/i,
    );
    expect(document.body.textContent).not.toMatch(/Checkout completed/i);
    expect(screen.getByTestId("checkout-success-refresh-button")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-success-pricing-link")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-success-pending-heading")).toBeNull();
    expect(screen.queryByTestId("checkout-success-confirmed-heading")).toBeNull();
    expect(screen.queryByTestId("checkout-success-activation-handoff")).toBeNull();
  });

  it("shows confirming copy (not completion) with a fresh same-device checkout marker", () => {
    mockEnt.value = {
      ...mockEnt.value,
      effectivePlanId: "free",
      isActive: true,
      displayPlanId: "free",
    };
    markCheckoutStarted(Date.now(), window.sessionStorage);
    renderPage();
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute("data-view", "confirming");
    expect(screen.getByTestId("checkout-success-pending-heading")).toHaveTextContent(
      /Confirming your checkout/i,
    );
    expect(document.body.textContent).not.toMatch(/Checkout completed/i);
    expect(screen.getByTestId("checkout-success-refresh-button")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-success-confirmed-heading")).toBeNull();
  });

  it("treats an expired same-device marker as no context", () => {
    mockEnt.value = {
      ...mockEnt.value,
      effectivePlanId: "free",
      isActive: true,
      displayPlanId: "free",
    };
    markCheckoutStarted(Date.now() - 3 * 60 * 60 * 1000, window.sessionStorage);
    renderPage();
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute("data-view", "no_context");
  });

  it('shows "Verdant Pro is active." after entitlement confirms an active paid plan', () => {
    mockEnt.value = {
      ...mockEnt.value,
      effectivePlanId: "pro_monthly",
      displayPlanId: "pro_monthly",
      isActive: true,
      source: "lovable_paddle_subscription",
    };
    renderPage();
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute("data-confirmed", "true");
    expect(screen.getByTestId("checkout-success-confirmed-heading")).toHaveTextContent(
      "Verdant Pro is active.",
    );
    expect(screen.getByTestId("account-plan-badge")).toHaveTextContent("Pro Monthly");
    expect(screen.getByTestId("checkout-success-activation-handoff")).toHaveTextContent(
      "Grow → Tent → Plant → Quick Log",
    );
  });

  it("shows confirmed state for Founder Lifetime", () => {
    mockEnt.value = {
      ...mockEnt.value,
      effectivePlanId: "founder_lifetime",
      displayPlanId: "founder_lifetime",
      isActive: true,
      source: "lovable_paddle_lifetime",
    };
    renderPage();
    expect(screen.getByTestId("account-plan-badge")).toHaveTextContent("Founder Lifetime");
  });
});

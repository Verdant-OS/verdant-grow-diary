/**
 * Phase 2b — CheckoutSuccess truth-copy tests.
 *
 * Confirms:
 *  - pending copy shown while entitlement is loading / free
 *  - "Verdant Pro is active." shown only after resolver confirms an active
 *    paid plan
 *  - Refresh action present in pending state
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
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
  it("shows pending copy when entitlement resolves to free", () => {
    mockEnt.value = {
      ...mockEnt.value,
      effectivePlanId: "free",
      isActive: true,
      displayPlanId: "free",
    };
    renderPage();
    expect(screen.getByTestId("checkout-success-page")).toHaveAttribute("data-confirmed", "false");
    expect(screen.getByTestId("checkout-success-pending-heading")).toHaveTextContent(
      /Checkout completed/i,
    );
    expect(screen.getByTestId("checkout-success-refresh-button")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-success-confirmed-heading")).toBeNull();
    expect(screen.queryByTestId("checkout-success-activation-handoff")).toBeNull();
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ResolvedEntitlement } from "@/lib/entitlements";
import { PLAN_CATALOG } from "@/lib/entitlements";
import Pricing from "@/pages/Pricing";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  auth: {
    user: { id: "user-1", email: "grower@example.test" } as { id: string; email: string } | null,
    loading: false,
  },
  entitlements: {
    loading: false,
    lookupFailed: false,
    entitlement: null as ResolvedEntitlement | null,
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    session: null,
    loading: mocks.auth.loading,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    ...mocks.entitlements,
    entitlement: mocks.entitlements.entitlement,
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: "live",
    unavailable: false,
    unavailableMessage: null,
    blockedReason: null,
    dismissBlocked: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

function entitlementFor(
  plan: keyof typeof PLAN_CATALOG,
  source: ResolvedEntitlement["source"],
): ResolvedEntitlement {
  return {
    effectivePlanId: plan,
    displayPlanId: plan,
    status: "active",
    isActive: true,
    capabilities: PLAN_CATALOG[plan],
    degraded: false,
    degradedReason: plan === "free" ? "null_row_free" : null,
    isStaff: false,
    source,
  };
}

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing#buy-credits"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  mocks.auth.user = { id: "user-1", email: "grower@example.test" };
  mocks.auth.loading = false;
  mocks.entitlements.loading = false;
  mocks.entitlements.lookupFailed = false;
  mocks.entitlements.entitlement = entitlementFor("free", "free");
});

describe("Pricing credit-pack entitlement gate", () => {
  it("shows honest paid-plan guidance and never opens pack checkout for Free", async () => {
    const user = userEvent.setup();
    renderPricing();

    expect(screen.getByTestId("pricing-credit-pack-gate")).toHaveAttribute(
      "data-gate-kind",
      "blocked",
    );
    expect(screen.getByTestId("pricing-credit-pack-gate")).toHaveTextContent(
      /Free grows include 3 AI Doctor checks per grow/i,
    );
    const buyButton = screen.getByTestId("pricing-cta-credit_pack_50");
    expect(buyButton).toBeDisabled();
    await user.click(buyButton);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ["pro_monthly", "lovable_paddle_subscription"],
    ["craft_annual", "lovable_paddle_subscription"],
    ["founder_lifetime", "lovable_paddle_lifetime"],
  ] as const)("allows %s to open the canonical pack checkout", async (plan, source) => {
    mocks.entitlements.entitlement = entitlementFor(plan, source);
    const user = userEvent.setup();
    renderPricing();

    expect(screen.getByTestId("pricing-credit-pack-gate")).toHaveAttribute(
      "data-gate-kind",
      "allowed",
    );
    const buyButton = screen.getByTestId("pricing-cta-credit_pack_50");
    expect(buyButton).toBeEnabled();
    await user.click(buyButton);
    expect(mocks.openCheckout).toHaveBeenCalledWith({ priceId: "credit_pack_50" });
  });

  it("fails closed while plan lookup is pending", () => {
    mocks.entitlements.loading = true;
    renderPricing();

    expect(screen.getByTestId("pricing-credit-pack-gate")).toHaveAttribute(
      "data-gate-kind",
      "pending",
    );
    expect(screen.getByTestId("pricing-cta-credit_pack_50")).toBeDisabled();
    expect(screen.getByTestId("pricing-cta-credit_pack_50")).toHaveTextContent(/Checking plan/i);
  });

  it("fails closed when the entitlement lookup cannot be verified", () => {
    mocks.entitlements.entitlement = entitlementFor("pro_monthly", "lovable_paddle_subscription");
    mocks.entitlements.lookupFailed = true;
    renderPricing();

    expect(screen.getByTestId("pricing-credit-pack-gate")).toHaveTextContent(
      /couldn't confirm your plan/i,
    );
    expect(screen.getByTestId("pricing-cta-credit_pack_150")).toBeDisabled();
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });
});

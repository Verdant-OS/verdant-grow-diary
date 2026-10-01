import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PLAN_CATALOG, type ResolvedEntitlement } from "@/lib/entitlements";
import Pricing from "@/pages/Pricing";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  dismissBlocked: vi.fn(),
  user: { id: "fixture-grower" } as { id: string } | null,
  entitlement: null as ResolvedEntitlement | null,
  loading: false,
  lookupFailed: false,
  blockedReason: null as string | null,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, signOut: vi.fn() }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    entitlement: mocks.entitlement,
    loading: mocks.loading,
    lookupFailed: mocks.lookupFailed,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: "live",
    unavailableMessage: null,
    blockedReason: mocks.blockedReason,
    blockedReasonCode: "price_request_failed",
    dismissBlocked: mocks.dismissBlocked,
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/hooks/useFounderSlotsRemaining", () => ({
  useFounderSlotsRemaining: () => ({ status: "unavailable" }),
}));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

function entitlementFor(plan: "free" | "pro_monthly"): ResolvedEntitlement {
  return {
    effectivePlanId: plan,
    displayPlanId: plan,
    status: "active",
    isActive: true,
    capabilities: PLAN_CATALOG[plan],
    degraded: false,
    degradedReason: plan === "free" ? "null_row_free" : null,
    isStaff: false,
    source: plan === "free" ? "free" : "lovable_paddle_subscription",
  };
}

function pricing() {
  return (
    <MemoryRouter initialEntries={["/pricing?returnTo=%2Fplants%2Ffixture-plant"]}>
      <Pricing />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  mocks.dismissBlocked.mockReset();
  mocks.user = { id: "fixture-grower" };
  mocks.entitlement = entitlementFor("pro_monthly");
  mocks.loading = false;
  mocks.lookupFailed = false;
  mocks.blockedReason = null;
});

const ineligibleStates = [
  {
    name: "pending plan lookup",
    change: () => (mocks.loading = true),
    copy: /Checking your plan/i,
  },
  {
    name: "failed plan lookup",
    change: () => (mocks.lookupFailed = true),
    copy: /couldn't confirm your plan/i,
  },
  {
    name: "downgraded Free plan",
    change: () => (mocks.entitlement = entitlementFor("free")),
    copy: /Free grows include 3 AI Doctor checks per grow/i,
  },
  { name: "signed-out viewer", change: () => (mocks.user = null), copy: /Sign in/i },
] as const;

describe("Pricing credit-pack retry eligibility", () => {
  for (const sku of ["credit_pack_50", "credit_pack_150"] as const) {
    it.each(ineligibleStates)(`blocks ${sku} retry after $name`, async ({ change, copy }) => {
      const user = userEvent.setup();
      const view = render(pricing());
      await user.click(screen.getByTestId(`pricing-cta-${sku}`));
      expect(mocks.openCheckout).toHaveBeenCalledTimes(1);
      mocks.openCheckout.mockClear();
      mocks.blockedReason = "Checkout interrupted. Please try again.";
      change();
      view.rerender(pricing());

      const panel = screen.getByTestId("pricing-checkout-recovery");
      const retry = within(panel).getByRole("button", { name: "Try again" });
      await user.click(retry);
      expect(mocks.openCheckout).not.toHaveBeenCalled();
      expect(mocks.dismissBlocked).not.toHaveBeenCalled();
      expect(retry).toBeDisabled();
      expect(within(panel).getByRole("status")).toHaveTextContent(copy);
      expect(panel).toHaveTextContent("Checkout interrupted. Please try again.");
    });

    it(`re-enables ${sku} retry when the paid plan is verified again`, async () => {
      const user = userEvent.setup();
      const view = render(pricing());
      await user.click(screen.getByTestId(`pricing-cta-${sku}`));
      mocks.openCheckout.mockClear();
      mocks.blockedReason = "Checkout interrupted. Please try again.";
      mocks.lookupFailed = true;
      view.rerender(pricing());
      expect(screen.getByTestId("pricing-checkout-retry")).toBeDisabled();

      mocks.lookupFailed = false;
      view.rerender(pricing());
      expect(screen.getByTestId("pricing-checkout-retry")).toBeEnabled();
      await user.click(screen.getByTestId("pricing-checkout-retry"));
      expect(mocks.openCheckout).toHaveBeenCalledTimes(1);
      expect(mocks.openCheckout).toHaveBeenCalledWith({
        priceId: sku,
        successUrl: expect.stringContaining("/checkout/success"),
      });
      const [options] = mocks.openCheckout.mock.calls[0] as [{ successUrl: string }];
      expect(new URL(options.successUrl).searchParams.get("returnTo")).toBeNull();
      expect(mocks.dismissBlocked).toHaveBeenCalledTimes(1);
      expect(
        within(screen.getByTestId("pricing-checkout-recovery")).queryByRole("status"),
      ).toBeNull();
    });
  }

  it("preserves subscription retry while the pack entitlement read is unverified", async () => {
    const user = userEvent.setup();
    const view = render(pricing());
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    mocks.openCheckout.mockClear();
    mocks.blockedReason = "Checkout interrupted. Please try again.";
    mocks.lookupFailed = true;
    view.rerender(pricing());

    expect(screen.getByTestId("pricing-checkout-retry")).toBeEnabled();
    await user.click(screen.getByTestId("pricing-checkout-retry"));
    expect(mocks.openCheckout).toHaveBeenCalledWith({
      priceId: "pro_annual",
      successUrl: undefined,
    });
  });
});

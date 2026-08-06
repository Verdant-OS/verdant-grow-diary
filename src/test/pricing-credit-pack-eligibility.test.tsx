import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
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

const scrollIntoView = vi.fn();
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const originalMatchMedia = window.matchMedia;

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

function renderPricingFromSource() {
  return render(
    <MemoryRouter initialEntries={["/source"]}>
      <Routes>
        <Route
          path="/source"
          element={<Link to="/pricing#buy-credits">Buy AI Doctor credits</Link>}
        />
        <Route path="/pricing" element={<Pricing />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  });
  window.matchMedia = originalMatchMedia;
  mocks.openCheckout.mockReset();
  mocks.auth.user = { id: "user-1", email: "grower@example.test" };
  mocks.auth.loading = false;
  mocks.entitlements.loading = false;
  mocks.entitlements.lookupFailed = false;
  mocks.entitlements.entitlement = entitlementFor("free", "free");
});

afterEach(() => {
  if (originalScrollIntoViewDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoViewDescriptor,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
  window.matchMedia = originalMatchMedia;
});

describe("Pricing credit-pack entitlement gate", () => {
  it("scrolls and focuses the real credit-pack target after cross-route SPA navigation", async () => {
    const user = userEvent.setup();
    renderPricingFromSource();

    await user.click(screen.getByRole("link", { name: "Buy AI Doctor credits" }));

    const target = await screen.findByTestId("pricing-credit-packs");
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute("id", "buy-credits");
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("uses an instant anchor handoff when reduced motion is preferred", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const user = userEvent.setup();
    renderPricingFromSource();

    await user.click(screen.getByRole("link", { name: "Buy AI Doctor credits" }));

    await waitFor(() => expect(screen.getByTestId("pricing-credit-packs")).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

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

  it("never pitches a purchase a Free viewer cannot complete", () => {
    // Regression: the "Out of monthly credits? Buy a one-time pack." subhead
    // used to render unconditionally, above the (correct) blocked-reason
    // copy — so a signed-in Free grower read a purchase pitch immediately
    // followed by the explanation of why they can't act on it. Gated on
    // creditPackGate.kind === "allowed" per the 2026-08 checkout-funnel audit.
    renderPricing();
    expect(screen.queryByText(/Buy a one-time pack/i)).toBeNull();
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
    expect(screen.getByText(/Buy a one-time pack/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/Buy a one-time pack/i)).toBeNull();
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
    expect(screen.queryByText(/Buy a one-time pack/i)).toBeNull();
    expect(screen.getByTestId("pricing-cta-credit_pack_150")).toBeDisabled();
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });
});

/**
 * Codex P1 on #2230 at 39dfe6da: a catalog failure is not always plan-scoped.
 * `pack_requires_monthly_plan` blocks every credit pack, and shared resolver
 * reasons (environment, gateway, auth, configuration) block every plan. On a
 * live page, the blocked CTAs and the trust panel must follow that scope:
 * live trust copy stays only while another plan can still create a charge.
 *
 * Also covers the rollback artifact's presentation: the build-time kill switch
 * surfaces as the paused message and the "Checkout paused" trust copy.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_PAUSED_MESSAGE,
  CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE,
} from "@/lib/paddleEnvironment";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  dismissBlocked: vi.fn(),
  paidEntitlement: {
    effectivePlanId: "pro_monthly",
    displayPlanId: "pro_monthly",
    status: "active",
    isActive: true,
    capabilities: {
      maxActiveGrows: null,
      aiCreditsPerGrow: null,
      aiMonthlyCredits: 100,
      liveSensors: true,
      advancedExports: true,
      multiTent: true,
      sensorHistoryDays: null,
      prioritySupport: true,
      blueprint: false,
    },
    degraded: false,
    degradedReason: null,
    isStaff: false,
    source: "lovable_paddle_subscription",
  },
  checkout: {
    environment: "live" as "live" | "sandbox" | "unavailable",
    unavailable: false,
    unavailableMessage: null as string | null,
    blockedReason: null as string | null,
    blockedReasonCode: null as string | null,
    blockedScope: null as "plan" | "pack" | "checkout" | null,
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "paid-grower" }, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: mocks.paidEntitlement,
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: mocks.checkout.environment,
    unavailable: mocks.checkout.unavailable,
    unavailableMessage: mocks.checkout.unavailableMessage,
    blockedReason: mocks.checkout.blockedReason,
    blockedReasonCode: mocks.checkout.blockedReasonCode,
    blockedScope: mocks.checkout.blockedScope,
    dismissBlocked: mocks.dismissBlocked,
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

import Pricing from "@/pages/Pricing";

function page() {
  return (
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>
  );
}

async function failAfterClicking(
  sku: string,
  failure: { code: string | null; scope: "plan" | "pack" | "checkout" },
) {
  const user = userEvent.setup();
  const view = render(page());
  await user.click(screen.getByTestId(`pricing-cta-${sku}`));
  mocks.openCheckout.mockReset();
  mocks.checkout.blockedReason = "We couldn't open checkout for that item.";
  mocks.checkout.blockedReasonCode = failure.code;
  mocks.checkout.blockedScope = failure.scope;
  view.rerender(page());
  return user;
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  mocks.dismissBlocked.mockReset();
  mocks.checkout.environment = "live";
  mocks.checkout.unavailable = false;
  mocks.checkout.unavailableMessage = null;
  mocks.checkout.blockedReason = null;
  mocks.checkout.blockedReasonCode = null;
  mocks.checkout.blockedScope = null;
});

describe("live checkout blocked scope on /pricing", () => {
  it("blocks every credit pack but keeps Pro and live copy for a pack-scoped failure", async () => {
    const user = await failAfterClicking("credit_pack_50", {
      code: "pack_requires_monthly_plan",
      scope: "pack",
    });

    expect(screen.getByTestId("pricing-cta-credit_pack_50")).toHaveTextContent(
      "Checkout unavailable",
    );
    expect(screen.getByTestId("pricing-cta-credit_pack_150")).toHaveTextContent(
      "Checkout unavailable",
    );
    expect(screen.getByTestId("pricing-cta-pro-annual")).toHaveTextContent("Upgrade to Pro");
    expect(screen.getByTestId("pricing-checkout-trust")).toHaveAttribute(
      "data-checkout-state",
      "live",
    );

    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(mocks.openCheckout).toHaveBeenCalledWith({ priceId: "pro_annual" });
  }, 15_000);

  it("keeps the other pack and live copy for a plan-scoped failure", async () => {
    await failAfterClicking("credit_pack_50", { code: "price_not_configured", scope: "plan" });

    expect(screen.getByTestId("pricing-cta-credit_pack_50")).toHaveTextContent(
      "Checkout unavailable",
    );
    expect(screen.getByTestId("pricing-cta-credit_pack_150")).not.toHaveTextContent(
      "Checkout unavailable",
    );
    expect(screen.getByTestId("pricing-checkout-trust")).toHaveAttribute(
      "data-checkout-state",
      "live",
    );
  }, 15_000);

  it("blocks every plan and drops live copy for a shared resolver failure", async () => {
    const user = await failAfterClicking("credit_pack_50", {
      code: "price_resolution_unavailable",
      scope: "checkout",
    });

    expect(screen.getByTestId("pricing-cta-credit_pack_150")).toHaveTextContent(
      "Checkout unavailable",
    );
    expect(screen.getByTestId("pricing-cta-pro-annual")).not.toHaveTextContent("Upgrade to Pro");
    const trust = screen.getByTestId("pricing-checkout-trust");
    expect(trust).toHaveAttribute("data-checkout-state", "unavailable");
    expect(trust).toHaveTextContent("no charge was made");

    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(mocks.openCheckout).not.toHaveBeenCalledWith({ priceId: "pro_annual" });
  }, 15_000);

  it("shows the paused trust copy when the rollback kill switch is on", () => {
    mocks.checkout.environment = "unavailable";
    mocks.checkout.unavailable = true;
    mocks.checkout.unavailableMessage = CHECKOUT_PAUSED_MESSAGE;
    render(page());

    const trust = screen.getByTestId("pricing-checkout-trust");
    expect(trust).toHaveAttribute("data-checkout-state", "unavailable");
    expect(trust).toHaveTextContent("Checkout paused");
    expect(trust).not.toHaveTextContent(/sandbox/i);
  });

  it("shows live off-host copy, not sandbox copy, for a live token on another host", () => {
    mocks.checkout.environment = "unavailable";
    mocks.checkout.unavailable = true;
    mocks.checkout.unavailableMessage = CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE;
    const { container } = render(page());

    const trust = screen.getByTestId("pricing-checkout-trust");
    expect(trust).toHaveAttribute("data-checkout-state", "unavailable");
    expect(trust).toHaveTextContent("Checkout unavailable on this site");
    expect(trust).not.toHaveTextContent(/sandbox/i);
    // The FAQ (and its JSON-LD) must not claim Verdant opens sandbox checkout.
    expect(container.textContent ?? "").not.toMatch(/opens Paddle's sandbox/i);
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(jsonLd).not.toMatch(/opens Paddle's sandbox/i);
  });
});

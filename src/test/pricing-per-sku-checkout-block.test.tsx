/**
 * A failed SKU must block only itself.
 *
 * `blockedReason` (one checkout attempt failed at the catalog seam) used to be
 * collapsed with `unavailableMessage` (Paddle not configured at all) into a
 * single page-wide `checkoutRecoveryReason`. Both `handlePaidIntent` and
 * `handleBuyPack` early-returned on it, so ONE failed credit-pack click — the
 * SKU most likely to be unconfigured — relabelled Pro and Craft to "Join the
 * launch list" and made them inert, even though those prices resolve fine.
 *
 * It was also sticky. The early return skips `openCheckout`, and `openCheckout`
 * is the only thing that clears `blockedReason`, so the page stayed dead for
 * the whole session unless the grower found the recovery panel's Dismiss.
 *
 * Second defect covered here: "Try again" read `lastCheckoutPlanRef`, which
 * pack clicks could not write (it was typed `SubscriberInterestPlanId`, and a
 * pack is deliberately not a plan). It therefore still held its initial value —
 * `interestPlan`, default `pro_annual` — so a grower who clicked "Buy 50
 * credits" ($9) and pressed Try again was opened into a $99/yr subscription
 * checkout.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  dismissBlocked: vi.fn(),
  track: vi.fn(),
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
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "paid-grower" },
    session: null,
    loading: false,
    signOut: vi.fn(),
  }),
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
    dismissBlocked: mocks.dismissBlocked,
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import Pricing from "@/pages/Pricing";

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

/** Simulate the hook reporting a runtime catalog failure for the last attempt. */
function failLastAttempt(rerender: () => void) {
  mocks.checkout.blockedReason = "We couldn't open checkout for that item.";
  rerender();
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  mocks.dismissBlocked.mockReset();
  mocks.track.mockReset();
  mocks.checkout.environment = "live";
  mocks.checkout.unavailable = false;
  mocks.checkout.unavailableMessage = null;
  mocks.checkout.blockedReason = null;
});

describe("per-SKU checkout blocking", () => {
  it("keeps Pro purchasable after a credit-pack checkout fails", async () => {
    const user = userEvent.setup();
    const view = renderPricing();

    await user.click(screen.getByTestId("pricing-cta-credit_pack_50"));
    expect(mocks.openCheckout).toHaveBeenCalledWith({ priceId: "credit_pack_50" });
    mocks.openCheckout.mockReset();

    failLastAttempt(() =>
      view.rerender(
        <MemoryRouter initialEntries={["/pricing"]}>
          <Pricing />
        </MemoryRouter>,
      ),
    );

    // The pack that failed says so...
    expect(screen.getByTestId("pricing-cta-credit_pack_50")).toHaveTextContent(
      "Checkout unavailable",
    );
    // ...and the plans that resolve fine are untouched.
    expect(screen.getByTestId("pricing-cta-pro-annual")).toHaveTextContent("Upgrade to Pro");
    expect(screen.getByTestId("pricing-cta-pro-annual")).not.toHaveTextContent(
      "Join the Pro launch list",
    );

    // Most importantly: Pro must still actually open checkout. The old code
    // early-returned here, and because that skipped openCheckout — the only
    // thing that clears blockedReason — the page never recovered.
    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(mocks.openCheckout).toHaveBeenCalledWith({ priceId: "pro_annual" });
  });

  it("retries the SKU that failed, not the default plan", async () => {
    const user = userEvent.setup();
    const view = renderPricing();

    await user.click(screen.getByTestId("pricing-cta-credit_pack_50"));
    mocks.openCheckout.mockReset();

    failLastAttempt(() =>
      view.rerender(
        <MemoryRouter initialEntries={["/pricing"]}>
          <Pricing />
        </MemoryRouter>,
      ),
    );

    await user.click(screen.getByTestId("pricing-checkout-retry"));

    // The whole point: a $9 pack retry must not become a $99/yr subscription.
    expect(mocks.openCheckout).toHaveBeenCalledWith({ priceId: "credit_pack_50" });
    expect(mocks.openCheckout).not.toHaveBeenCalledWith({ priceId: "pro_annual" });
  });

  it("still blocks every SKU when Paddle is unconfigured entirely", async () => {
    // Non-triviality guard. `unavailableMessage` means no SKU is purchasable,
    // so it MUST stay global — a per-SKU fix that also scoped this would let
    // growers click into a checkout that cannot open.
    mocks.checkout.environment = "unavailable";
    mocks.checkout.unavailable = true;
    mocks.checkout.unavailableMessage = "Checkout is still in test mode.";

    const user = userEvent.setup();
    renderPricing();

    expect(screen.getByTestId("pricing-cta-pro-annual")).toHaveTextContent(
      "Join the Pro launch list",
    );
    expect(screen.getByTestId("pricing-cta-credit_pack_50")).toHaveTextContent(
      "Checkout unavailable",
    );

    await user.click(screen.getByTestId("pricing-cta-pro-annual"));
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it("arms the recovery panel for a pack failure, as it does for a plan", async () => {
    // `setRecoveryRequested(true)` was missing from handleBuyPack, so the
    // scroll+focus effect never ran and the panel appeared far above the
    // credit-pack section the grower was looking at.
    const user = userEvent.setup();
    const view = renderPricing();

    await user.click(screen.getByTestId("pricing-cta-credit_pack_50"));
    failLastAttempt(() =>
      view.rerender(
        <MemoryRouter initialEntries={["/pricing"]}>
          <Pricing />
        </MemoryRouter>,
      ),
    );

    const panel = screen.getByTestId("pricing-checkout-recovery");
    expect(panel).toBeInTheDocument();
    // The panel is focus-managed; arming it is what the effect gates on.
    expect(panel).toHaveAttribute("tabIndex", "-1");
  });
});

/**
 * Every paid CTA's LABEL must agree with what that CTA actually DOES.
 *
 * #494 scoped the checkout block per-SKU, but two CTAs kept deriving their
 * label from the old page-wide `checkoutRecoveryReason`: the Founder highlight
 * band and the footer Pro button. After one unrelated SKU failed (a credit
 * pack, say) those two read "Join the … launch list" while their onClick still
 * called `openCheckout` — a control presented as an email-signup that actually
 * starts a purchase. That is a worse failure than the bug #494 fixed.
 *
 * Enumerating every paid CTA here rather than patching the two known sites:
 * the page has SIX of them across three sections, and the failure mode is
 * "someone adds a seventh and derives its label from the wrong value".
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  checkout: {
    environment: "live" as "live" | "sandbox" | "unavailable",
    unavailable: false,
    unavailableMessage: null as string | null,
    blockedReason: null as string | null,
  },
}));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: mocks.openCheckout,
    loading: false,
    environment: mocks.checkout.environment,
    unavailable: mocks.checkout.unavailable,
    unavailableMessage: mocks.checkout.unavailableMessage,
    blockedReason: mocks.checkout.blockedReason,
    dismissBlocked: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));

import { CREDIT_PACKS } from "@/constants/pricing";
import Pricing from "@/pages/Pricing";

/** Every CTA that can open a paid checkout, and the SKU it opens. */
const PAID_CTAS: ReadonlyArray<{ testId: string; sku: string }> = [
  { testId: "pricing-cta-pro-annual", sku: "pro_annual" },
  { testId: "pricing-cta-craft-annual", sku: "craft_annual" },
  { testId: "pricing-cta-founder-lifetime", sku: "founder_lifetime" },
  { testId: "pricing-cta-founder-highlight", sku: "founder_lifetime" },
  { testId: "pricing-cta-pro-footer", sku: "pro_monthly" },
  // Derived from the same constant the page maps over, so adding a third pack
  // cannot silently escape this guard. Listing only credit_pack_50 by hand is
  // exactly how credit_pack_150 went unchecked in the first version of this
  // supposedly exhaustive table.
  ...CREDIT_PACKS.map((pack) => ({ testId: `pricing-cta-${pack.sku}`, sku: pack.sku })),
];

/** Copy that tells a grower "this will NOT take your money right now." */
const BLOCKED_COPY = /launch list|checkout unavailable|sold out/i;

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing?plan=founder_lifetime"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

function rerenderAfterFailure(view: ReturnType<typeof renderPricing>) {
  mocks.checkout.blockedReason = "We couldn't open checkout for that item.";
  view.rerender(
    <MemoryRouter initialEntries={["/pricing?plan=founder_lifetime"]}>
      <Pricing />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.openCheckout.mockReset();
  mocks.checkout.environment = "live";
  mocks.checkout.unavailable = false;
  mocks.checkout.unavailableMessage = null;
  mocks.checkout.blockedReason = null;
});

describe("paid CTA label matches behaviour", () => {
  it("finds every paid CTA it claims to cover", () => {
    // Non-triviality: if a testid is renamed, the loops below would silently
    // cover nothing and pass.
    renderPricing();
    for (const { testId } of PAID_CTAS) {
      expect(screen.queryByTestId(testId), `${testId} not found on the page`).not.toBeNull();
    }
  });

  it("never labels a CTA as blocked while it still opens checkout", async () => {
    // Fail ONE unrelated SKU, then check every other CTA. A CTA that reads
    // "Join the … launch list" must not start a purchase.
    const user = userEvent.setup();
    const view = renderPricing();
    await user.click(screen.getByTestId("pricing-cta-credit_pack_50"));
    rerenderAfterFailure(view);

    for (const { testId, sku } of PAID_CTAS) {
      if (sku === "credit_pack_50") continue; // the one that actually failed
      const button = screen.getByTestId(testId);
      const looksBlocked = BLOCKED_COPY.test(button.textContent ?? "");
      expect(
        looksBlocked,
        `${testId} reads "${button.textContent?.trim()}" after an unrelated SKU ` +
          `(credit_pack_50) failed — a grower is told this is a launch-list ` +
          `signup while the click still opens a real ${sku} checkout`,
      ).toBe(false);
    }
  });

  it("does label the CTA whose own SKU failed", () => {
    // The complement — proves the assertion above is not just "nothing is ever
    // labelled blocked".
    const view = renderPricing();
    // No click, so the failure is unattributed and fails closed page-wide.
    rerenderAfterFailure(view);
    expect(screen.getByTestId("pricing-cta-pro-footer").textContent).toMatch(BLOCKED_COPY);
    expect(screen.getByTestId("pricing-cta-founder-highlight").textContent).toMatch(BLOCKED_COPY);
  });
});

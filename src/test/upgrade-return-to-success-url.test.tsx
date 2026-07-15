/**
 * Upgrade page — returnTo → checkout successUrl forwarding.
 *
 * Proves the successUrl handed to the canonical checkout hook carries a
 * sanitized returnTo when present, drops unsafe values, and preserves the
 * default (no returnTo) URL otherwise. Guards against open-redirect /
 * customer-id leakage into the checkout URL.
 *
 * Trunk routed Upgrade's confirm through usePaddleCheckout (M1 audit fix)
 * instead of a local paddle.Checkout.open call, so the assertion seam is
 * the hook's openCheckout options; window.Paddle stays stubbed only to
 * satisfy the page's readiness interlocks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const paddleMock = vi.hoisted(() => ({ checkoutOpen: vi.fn() }));
const canonicalCheckout = vi.hoisted(() => ({ openCheckout: vi.fn() }));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: canonicalCheckout.openCheckout,
    loading: false,
  }),
}));

vi.mock("@/lib/paddleConfig", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/paddleConfig")>("@/lib/paddleConfig");
  return {
    ...actual,
    resolvePaddleConfig: () => ({
      available: true,
      environment: "sandbox",
      clientToken: "test_token",
      priceIds: {
        "pro-monthly": "pri_pro_month",
        "pro-annual": "pri_pro_annual",
        "founder-lifetime": "pri_founder",
      },
    }),
  };
});

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { displayPlanId: null },
  }),
}));

import { PRICING_TIERS } from "@/config/pricing";
import Upgrade from "@/pages/Upgrade";

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Upgrade />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  paddleMock.checkoutOpen.mockReset();
  canonicalCheckout.openCheckout.mockReset();
  for (const t of PRICING_TIERS) {
    if (t.id === "pro_monthly") t.paddlePriceId = "pri_pro_month";
    if (t.id === "pro_annual") t.paddlePriceId = "pri_pro_annual";
    if (t.id === "founder_lifetime") t.paddlePriceId = "pri_founder";
  }
  (window as any).Paddle = {
    Environment: { set: () => {} },
    Initialize: () => {},
    Checkout: { open: paddleMock.checkoutOpen },
  };
});

afterEach(() => {
  delete (window as any).Paddle;
  document.querySelectorAll('script[src*="paddle.com"]').forEach((s) => s.remove());
});

function confirmCheckout() {
  fireEvent.click(screen.getByTestId("tier-pro_monthly-cta"));
  fireEvent.click(screen.getByTestId("checkout-confirm-continue"));
}

function openedSuccessUrl(): string {
  expect(canonicalCheckout.openCheckout).toHaveBeenCalledTimes(1);
  const options = canonicalCheckout.openCheckout.mock.calls[0][0];
  return options?.successUrl ?? "";
}

describe("Upgrade → checkout successUrl returnTo forwarding", () => {
  it("forwards a safe returnTo into the checkout successUrl (URL-encoded)", () => {
    renderPage("/upgrade?returnTo=/pheno-hunts/new");
    confirmCheckout();
    const url = openedSuccessUrl();
    expect(url).toContain("/checkout/success");
    expect(url).toContain(`returnTo=${encodeURIComponent("/pheno-hunts/new")}`);
    // The page must never bypass the canonical hook with a direct open.
    expect(paddleMock.checkoutOpen).not.toHaveBeenCalled();
  });

  it("drops external-URL returnTo — successUrl falls back to bare /checkout/success", () => {
    renderPage("/upgrade?returnTo=https://evil.example/pwn");
    confirmCheckout();
    const url = openedSuccessUrl();
    expect(url).toMatch(/\/checkout\/success$/);
    expect(url).not.toContain("evil.example");
  });

  it("drops protocol-relative returnTo", () => {
    renderPage("/upgrade?returnTo=//evil.example/pwn");
    confirmCheckout();
    const url = openedSuccessUrl();
    expect(url).not.toContain("evil.example");
    expect(url).toMatch(/\/checkout\/success$/);
  });

  it("drops javascript: returnTo", () => {
    renderPage("/upgrade?returnTo=javascript:alert(1)");
    confirmCheckout();
    const url = openedSuccessUrl();
    expect(url).not.toContain("javascript");
    expect(url).toMatch(/\/checkout\/success$/);
  });

  it("omits returnTo entirely when the query param is missing", () => {
    renderPage("/upgrade");
    confirmCheckout();
    const url = openedSuccessUrl();
    expect(url).toMatch(/\/checkout\/success$/);
    expect(url).not.toContain("returnTo");
  });

  it("never leaks customer/subscription identifiers into successUrl", () => {
    renderPage("/upgrade?returnTo=/pheno-hunts/new");
    confirmCheckout();
    const url = openedSuccessUrl();
    expect(url).not.toMatch(/ctm_|sub_|txn_|paddle_customer_id|paddle_subscription_id/i);
  });
});

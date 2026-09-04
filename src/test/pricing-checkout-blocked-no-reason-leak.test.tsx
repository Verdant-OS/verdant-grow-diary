/**
 * Pricing blocked-checkout UI — reason-code leak guard.
 *
 * The `usePaddleCheckout` hook exposes a `blockedReason` string that is meant
 * to be the calm, grower-facing message produced by
 * `getPaddleCheckoutCatalogMessage(...)`. The sanitized reason enum tokens
 * (`unknown_plan`, `price_not_configured`, `price_resolution_unavailable`,
 * `plan_sold_out`, `pack_requires_monthly_plan`, `auth_required`,
 * `price_gateway_unavailable`, `price_request_failed`,
 * `price_response_unusable`, plus the env-unavailable telemetry token
 * `checkout_env_unavailable`) are telemetry-only and must never appear in
 * the rendered DOM.
 *
 * This test drives the Pricing page through every catalog reason and asserts:
 *   1. The recovery panel is rendered.
 *   2. The human copy for that reason is present.
 *   3. None of the internal reason tokens appear anywhere in the rendered
 *      DOM (including data-* attributes, aria-labels, and button text).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { getPaddleCheckoutCatalogMessage, type PaddleCheckoutCatalogReason } from "@/lib/paddle";
import { peekPlanIntent } from "@/lib/checkoutPlanIntent";

const openCheckoutMock = vi.fn(async () => {});
const dismissBlockedMock = vi.fn();
const signOutMock = vi.fn(async () => {});

let currentBlockedReason: string | null = null;
let currentBlockedReasonCode: PaddleCheckoutCatalogReason | null = null;
let currentUnavailableMessage: string | null = null;

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({
    openCheckout: openCheckoutMock,
    loading: false,
    environment: "sandbox" as const,
    unavailableMessage: currentUnavailableMessage,
    blockedReason: currentBlockedReason,
    blockedReasonCode: currentBlockedReasonCode,
    dismissBlocked: dismissBlockedMock,
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "paid-grower" },
    session: null,
    loading: false,
    signOut: signOutMock,
  }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: {
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
    refetch: vi.fn(async () => false),
  }),
}));
vi.mock("@/hooks/useFounderSlotsRemaining", () => ({
  useFounderSlotsRemaining: () => ({
    status: "ready" as const,
    remaining: 25,
    total: 100,
    claimed: 75,
    soldOut: false,
  }),
}));
vi.mock("@/components/SubscriberInterestForm", () => ({
  default: () => <div data-testid="subscriber-interest-form" />,
}));

import Pricing from "@/pages/Pricing";

const REASON_TOKENS: readonly string[] = [
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
  "pack_requires_monthly_plan",
  "auth_required",
  "price_gateway_unavailable",
  "price_request_failed",
  "price_response_unusable",
  "checkout_env_unavailable",
  "runtime_failure",
  "environment_unavailable",
];

const CATALOG_REASONS: readonly PaddleCheckoutCatalogReason[] = [
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
  "pack_requires_monthly_plan",
  "auth_required",
  "price_gateway_unavailable",
  "price_request_failed",
  "price_response_unusable",
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{`${location.pathname}${location.search}`}</output>;
}

function renderPricing() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <Pricing />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function assertNoReasonTokensLeaked(html: string) {
  for (const token of REASON_TOKENS) {
    expect(html, `sanitized reason token "${token}" leaked into blocked checkout UI`).not.toContain(
      token,
    );
  }
}

describe("Pricing blocked checkout — sanitized reason-code leak guard", () => {
  beforeEach(() => {
    currentBlockedReason = null;
    currentBlockedReasonCode = null;
    currentUnavailableMessage = null;
    openCheckoutMock.mockClear();
    dismissBlockedMock.mockClear();
    signOutMock.mockClear();
    window.sessionStorage.clear();
  });

  for (const reason of CATALOG_REASONS) {
    it(`renders human copy but no reason token for "${reason}"`, () => {
      const humanCopy = getPaddleCheckoutCatalogMessage(reason);
      currentBlockedReason = humanCopy;
      currentBlockedReasonCode = reason;

      const { container, getByTestId } = renderPricing();

      // 1. Recovery panel rendered.
      expect(getByTestId("pricing-checkout-recovery")).toBeTruthy();

      // 2. Human copy present.
      expect(container.textContent ?? "").toContain(humanCopy);

      // 3. No sanitized reason tokens leaked (full markup, incl. data-* attrs).
      assertNoReasonTokensLeaked(container.innerHTML);
    });
  }

  it("renders env-unavailable message without leaking env/env-token strings", () => {
    // Simulate the fail-closed env-unavailable path where
    // usePaddleCheckout surfaces a calm `unavailableMessage` rather than a
    // catalog `blockedReason`. Same guarantee: no telemetry tokens leak.
    currentUnavailableMessage =
      "Checkout is temporarily unavailable. Please try again in a moment.";

    const { container, getByTestId } = renderPricing();

    expect(getByTestId("pricing-checkout-recovery")).toBeTruthy();
    expect(container.textContent ?? "").toContain(currentUnavailableMessage);
    expect(
      screen.getByRole("heading", { name: "Checkout isn't ready here yet. Get one launch email." }),
    ).toBeTruthy();
    expect(screen.getByTestId("subscriber-interest-form")).toBeTruthy();
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  for (const reason of [
    "price_gateway_unavailable",
    "price_request_failed",
    "price_response_unusable",
  ] as const) {
    it(`${reason}: renders a retry-only transient panel`, () => {
      currentBlockedReasonCode = reason;
      currentBlockedReason = getPaddleCheckoutCatalogMessage(reason);

      const { container, getByTestId, queryByTestId, queryByText } = renderPricing();
      const panel = getByTestId("pricing-checkout-recovery");

      expect(
        within(panel).getByRole("heading", { name: "Checkout needs another try." }),
      ).toBeTruthy();
      expect(queryByText("Checkout isn't ready here yet. Get one launch email.")).toBeNull();
      expect(within(panel).getAllByRole("button")).toHaveLength(1);
      expect(getByTestId("pricing-checkout-retry")).toHaveTextContent("Try again");
      expect(queryByTestId("pricing-checkout-choose-another-plan")).toBeNull();
      expect(queryByTestId("pricing-checkout-dismiss")).toBeNull();
      expect(queryByTestId("pricing-checkout-sign-in")).toBeNull();
      expect(queryByTestId("subscriber-interest-form")).toBeNull();
      assertNoReasonTokensLeaked(container.innerHTML);
    });
  }

  it("configuration failure keeps the launch-list recovery", () => {
    currentBlockedReasonCode = "price_not_configured";
    currentBlockedReason = getPaddleCheckoutCatalogMessage("price_not_configured");

    const { container, getByTestId } = renderPricing();

    expect(
      screen.getByRole("heading", {
        name: "Checkout isn't ready here yet. Get one launch email.",
      }),
    ).toBeTruthy();
    expect(getByTestId("subscriber-interest-form")).toBeTruthy();
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  it("auth_required saves the plan, signs out the stale bearer, and opens real sign-in", async () => {
    const signOutGate: { resolve?: () => void } = {};
    signOutMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          signOutGate.resolve = resolve;
        }),
    );
    currentBlockedReasonCode = "auth_required";
    currentBlockedReason = getPaddleCheckoutCatalogMessage("auth_required");

    const { container, getByTestId, queryByTestId, queryByText } = renderPricing();
    const panel = getByTestId("pricing-checkout-recovery");

    expect(
      within(panel).getByRole("heading", { name: "Sign in again to continue checkout." }),
    ).toBeTruthy();
    expect(within(panel).getAllByRole("button")).toHaveLength(1);
    expect(queryByText("Checkout isn't ready here yet. Get one launch email.")).toBeNull();
    expect(queryByTestId("pricing-checkout-retry")).toBeNull();
    expect(queryByTestId("subscriber-interest-form")).toBeNull();

    // The auth handoff must preserve the SKU the grower actually selected,
    // not whichever cadence was the page default when it mounted.
    fireEvent.click(getByTestId("pricing-cta-craft-annual"));
    fireEvent.click(getByTestId("pricing-checkout-sign-in"));

    // RENEGOTIATED with the behaviour change: this used to assert the intent was
    // already stored here, i.e. BEFORE `signOut()` settled. That ordering is the
    // defect — a rejected sign-out left a consumable intent behind. The pin is
    // kept and inverted so the old ordering cannot come back.
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(peekPlanIntent()).toBeNull();
    expect(getByTestId("location-probe")).toHaveTextContent("/pricing");
    expect(signOutGate.resolve).toBeTypeOf("function");
    signOutGate.resolve?.();
    await waitFor(() => {
      expect(getByTestId("location-probe")).toHaveTextContent(
        "/auth?mode=signin&redirectTo=%2Fpricing%3Fplan%3Dcraft_annual",
      );
    });
    // ...and it IS stored once the handoff actually happened.
    expect(peekPlanIntent()).toBe("craft_annual");
    expect(openCheckoutMock).not.toHaveBeenCalled();
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  // #1278 finding 1. A rejected sign-out does not navigate, so the grower stays
  // on Pricing. If the intent were written first it would sit in sessionStorage
  // (15-minute TTL, destructive consume) and the next mount in that tab would
  // auto-open checkout — including after a DIFFERENT account signs in, since the
  // key is per-tab and not account-scoped. Billing stays server-authoritative so
  // this grants nothing, but it is a paid surface nobody asked for.
  it("writes no plan intent when the sign-out handoff fails", async () => {
    signOutMock.mockRejectedValueOnce(new Error("sign-out failed"));
    currentBlockedReasonCode = "auth_required";
    currentBlockedReason = getPaddleCheckoutCatalogMessage("auth_required");

    const { getByTestId } = renderPricing();

    fireEvent.click(getByTestId("pricing-cta-craft-annual"));
    fireEvent.click(getByTestId("pricing-checkout-sign-in"));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
    // No intent, and no navigation: the handoff never happened, so nothing may
    // survive it.
    expect(peekPlanIntent()).toBeNull();
    expect(getByTestId("location-probe")).toHaveTextContent("/pricing");
    // The recovery panel stays visible so the grower can try again.
    expect(getByTestId("pricing-checkout-recovery")).toBeTruthy();
  });

  // #1278 finding 2 (Codex P2). get-paddle-price answers `auth_required` before
  // it inspects the SKU, so credit packs reach this branch too — but packs are
  // not plan intents: savePlanIntent rejects them and buildCheckoutPlanReturnPath
  // strips a non-allowlisted `?plan=`. Without the anchor the grower returns from
  // sign-in to generic Pricing with their top-up forgotten.
  it("returns a credit-pack buyer to the pack section through re-authentication", async () => {
    currentBlockedReasonCode = "auth_required";
    currentBlockedReason = getPaddleCheckoutCatalogMessage("auth_required");

    const { getByTestId } = renderPricing();

    fireEvent.click(getByTestId("pricing-cta-credit_pack_50"));
    fireEvent.click(getByTestId("pricing-checkout-sign-in"));

    await waitFor(() => {
      expect(getByTestId("location-probe")).toHaveTextContent(
        "/auth?mode=signin&redirectTo=%2Fpricing%23buy-credits",
      );
    });
    // Packs are deliberately NOT auto-resumed — re-opening a paid pack checkout
    // unasked is the surface finding 1 exists to close. The anchor returns the
    // selection without reopening it.
    expect(peekPlanIntent()).toBeNull();
  });

  it("does not render the recovery panel or leak tokens when checkout is healthy", () => {
    const { container, queryByTestId } = renderPricing();

    expect(queryByTestId("pricing-checkout-recovery")).toBeNull();
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  it("only sources blockedReason from getPaddleCheckoutCatalogMessage — none of its outputs contain reason tokens", () => {
    // Upstream contract check: the human copies produced by
    // getPaddleCheckoutCatalogMessage must themselves be token-free. If a
    // future edit inlines a token into the copy, the panel would render it.
    for (const reason of CATALOG_REASONS) {
      const copy = getPaddleCheckoutCatalogMessage(reason);
      for (const token of REASON_TOKENS) {
        expect(
          copy,
          `catalog message for "${reason}" contains reason token "${token}"`,
        ).not.toContain(token);
      }
    }
    cleanup();
  });
});

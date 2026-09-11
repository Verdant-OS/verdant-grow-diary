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
import {
  act,
  render,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { getPaddleCheckoutCatalogMessage, type PaddleCheckoutCatalogReason } from "@/lib/paddle";
import { CHECKOUT_PLAN_INTENT_STORAGE_KEY, peekPlanIntent } from "@/lib/checkoutPlanIntent";
import type { ReactNode } from "react";

const realHookHarness = vi.hoisted(() => ({
  user: { id: "paid-grower", email: "grower@example.test" } as {
    id: string;
    email: string;
  } | null,
  catalogReason: null as string | null,
  initializePaddle: vi.fn(async () => {}),
  getPaddlePriceId: vi.fn<(id: string) => void>(),
}));

vi.mock("@/lib/paddle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paddle")>();
  return {
    ...actual,
    resolvePaddleCheckout: () => "sandbox" as const,
    initializePaddle: realHookHarness.initializePaddle,
    getPaddlePriceId: async (id: string) => {
      realHookHarness.getPaddlePriceId(id);
      if (realHookHarness.catalogReason) {
        const reason = realHookHarness.catalogReason as PaddleCheckoutCatalogReason;
        throw new actual.PaddleCheckoutCatalogUnavailableError(
          reason,
          id,
          actual.getPaddleCheckoutCatalogMessage(reason),
        );
      }
      return `pri_${id}`;
    },
  };
});

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
    user: realHookHarness.user,
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

function renderPricing(initialEntry = "/pricing") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Pricing />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function renderRealCheckoutHook(initialEntry = "/pricing") {
  const { usePaddleCheckout: useRealPaddleCheckout } = await vi.importActual<
    typeof import("@/hooks/usePaddleCheckout")
  >("@/hooks/usePaddleCheckout");
  function HookWrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  }
  return renderHook(() => useRealPaddleCheckout(), { wrapper: HookWrapper });
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
    realHookHarness.user = { id: "paid-grower", email: "grower@example.test" };
    realHookHarness.catalogReason = null;
    realHookHarness.initializePaddle.mockClear();
    realHookHarness.getPaddlePriceId.mockClear();
    window.sessionStorage.clear();
    (window as any).Paddle = { Checkout: { open: vi.fn() } };
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

  it("auth_required saves the plan only after stale-bearer sign-out, then opens real sign-in", async () => {
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

    expect(peekPlanIntent()).toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(getByTestId("location-probe")).toHaveTextContent("/pricing");
    expect(signOutGate.resolve).toBeTypeOf("function");
    signOutGate.resolve?.();
    await waitFor(() => {
      expect(peekPlanIntent()).toBe("craft_annual");
      expect(getByTestId("location-probe")).toHaveTextContent(
        "/auth?mode=signin&redirectTo=%2Fpricing%3Fplan%3Dcraft_annual",
      );
    });
    expect(openCheckoutMock).not.toHaveBeenCalled();
    assertNoReasonTokensLeaked(container.innerHTML);
  });

  it("auth_required leaves no orphan intent when stale-bearer sign-out rejects", async () => {
    signOutMock.mockRejectedValueOnce(new Error("local sign-out failed"));
    currentBlockedReasonCode = "auth_required";
    currentBlockedReason = getPaddleCheckoutCatalogMessage("auth_required");

    const { getByTestId } = renderPricing();
    fireEvent.click(getByTestId("pricing-cta-craft-annual"));
    fireEvent.click(getByTestId("pricing-checkout-sign-in"));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(getByTestId("pricing-checkout-sign-in")).not.toBeDisabled();
    });
    expect(peekPlanIntent()).toBeNull();
    expect(getByTestId("location-probe")).toHaveTextContent("/pricing");
    expect(dismissBlockedMock).not.toHaveBeenCalled();
  });

  it.each(["credit_pack_50", "credit_pack_150"] as const)(
    "auth_required preserves %s through the completed sign-out handoff",
    async (sku) => {
      const signOutGate: { resolve?: () => void } = {};
      signOutMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            signOutGate.resolve = resolve;
          }),
      );
      currentBlockedReasonCode = "auth_required";
      currentBlockedReason = getPaddleCheckoutCatalogMessage("auth_required");

      const { getByTestId } = renderPricing("/pricing?returnTo=%2Fdashboard#buy-credits");
      fireEvent.click(getByTestId(`pricing-cta-${sku}`));
      fireEvent.click(getByTestId("pricing-checkout-sign-in"));

      expect(peekPlanIntent()).toBeNull();
      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(signOutGate.resolve).toBeTypeOf("function");
      signOutGate.resolve?.();

      await waitFor(() => {
        expect(peekPlanIntent()).toBe(sku);
        const locationText = getByTestId("location-probe").textContent ?? "";
        const authUrl = new URL(locationText, "https://verdant.test");
        expect(authUrl.pathname).toBe("/auth");
        expect(authUrl.searchParams.get("mode")).toBe("signin");
        expect(authUrl.searchParams.get("redirectTo")).toBe(
          `/pricing?returnTo=%2Fdashboard&plan=${sku}`,
        );
      });
      expect(openCheckoutMock).not.toHaveBeenCalled();
    },
  );

  it.each(["credit_pack_50", "credit_pack_150"] as const)(
    "a repeated auth recovery on returned %s keeps the same pack identity",
    async (sku) => {
      currentBlockedReasonCode = "auth_required";
      currentBlockedReason = getPaddleCheckoutCatalogMessage("auth_required");

      const { getByTestId } = renderPricing(`/pricing?returnTo=%2Fdashboard&plan=${sku}`);
      fireEvent.click(getByTestId("pricing-checkout-sign-in"));

      await waitFor(() => {
        expect(peekPlanIntent()).toBe(sku);
        const locationText = getByTestId("location-probe").textContent ?? "";
        const authUrl = new URL(locationText, "https://verdant.test");
        expect(authUrl.searchParams.get("redirectTo")).toBe(
          `/pricing?returnTo=%2Fdashboard&plan=${sku}`,
        );
      });
    },
  );

  it("exposes and clears blockedReasonCode through the real checkout hook", async () => {
    realHookHarness.catalogReason = "auth_required";
    const { result } = await renderRealCheckoutHook();

    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(result.current.blockedReasonCode).toBe("auth_required");
    expect(result.current.blockedReason).toBe(getPaddleCheckoutCatalogMessage("auth_required"));

    realHookHarness.catalogReason = null;
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });
    expect(result.current.blockedReasonCode).toBeNull();
    expect(result.current.blockedReason).toBeNull();

    realHookHarness.catalogReason = "auth_required";
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });
    expect(result.current.blockedReasonCode).toBe("auth_required");

    act(() => {
      result.current.dismissBlocked();
    });
    expect(result.current.blockedReasonCode).toBeNull();
    expect(result.current.blockedReason).toBeNull();
  });

  it.each(["credit_pack_50", "credit_pack_150"] as const)(
    "the real hook safely resumes saved %s exactly once",
    async (sku) => {
      window.sessionStorage.setItem(
        CHECKOUT_PLAN_INTENT_STORAGE_KEY,
        JSON.stringify({ plan: sku, savedAt: Date.now() }),
      );
      const paddleOpen = vi.fn();
      (window as any).Paddle = { Checkout: { open: paddleOpen } };

      const { rerender } = await renderRealCheckoutHook(
        "/pricing?returnTo=%2Fdashboard&plan=" + sku,
      );

      await waitFor(() => expect(paddleOpen).toHaveBeenCalledTimes(1));
      expect(realHookHarness.getPaddlePriceId).toHaveBeenCalledWith(sku);
      expect(peekPlanIntent()).toBeNull();

      const checkout = paddleOpen.mock.calls[0][0];
      expect(checkout.items).toEqual([{ priceId: `pri_${sku}`, quantity: 1 }]);
      const successUrl = new URL(checkout.settings.successUrl);
      expect(successUrl.pathname).toBe("/checkout/success");
      expect(successUrl.searchParams.get("packReturnTo")).toBe("/dashboard");
      expect(successUrl.searchParams.get("returnTo")).toBeNull();

      rerender();
      await act(async () => {
        await Promise.resolve();
      });
      expect(paddleOpen).toHaveBeenCalledTimes(1);
    },
  );

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

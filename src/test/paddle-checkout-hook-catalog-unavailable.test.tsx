/**
 * usePaddleCheckout — catalog-unavailable calm-blocked behavior.
 *
 * When the server-side price resolver refuses a plan because the Paddle
 * catalog entry doesn't exist yet or the corresponding PADDLE_PRICE_* env
 * var is unset (the shape of a Craft checkout right now), the hook must:
 *   - land in a calm blockedReason state with the plan-specific message
 *   - NOT show a destructive toast
 *   - clear `loading`
 * A generic resolver failure (unrecognized error body) must still route
 * through the destructive-toast path so real breakages stay visible.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { ReactNode } from "react";

const navigateMock = vi.fn();
vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "u@example.com" } }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

type CatalogReason =
  | "unknown_plan"
  | "price_not_configured"
  | "price_resolution_unavailable"
  | "plan_sold_out"
  | "pack_requires_monthly_plan"
  // Client-classified additions. These reach the hook exactly like the
  // server-declared ones, so the calm-state and telemetry contract must
  // hold for them too — that is what the block at the bottom pins.
  | "auth_required"
  | "price_gateway_unavailable"
  | "price_request_failed"
  | "price_response_unusable";

const state = {
  resolverError: null as null | { reason: CatalogReason; message: string } | "generic",
};

vi.mock("@/lib/paddle", async () => {
  class PaddleCheckoutUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PaddleCheckoutUnavailableError";
    }
  }
  class PaddleCheckoutCatalogUnavailableError extends Error {
    readonly reason: CatalogReason;
    readonly planId: string;
    constructor(reason: CatalogReason, planId: string, message: string) {
      super(message);
      this.name = "PaddleCheckoutCatalogUnavailableError";
      this.reason = reason;
      this.planId = planId;
    }
  }
  return {
    PaddleCheckoutUnavailableError,
    PaddleCheckoutCatalogUnavailableError,
    resolvePaddleCheckout: () => "sandbox",
    getCheckoutUnavailableMessage: () => null,
    initializePaddle: vi.fn(async () => {}),
    getPaddlePriceId: vi.fn(async (id: string) => {
      if (state.resolverError === "generic") {
        throw new Error("network exploded");
      }
      if (state.resolverError) {
        throw new PaddleCheckoutCatalogUnavailableError(
          state.resolverError.reason,
          id,
          state.resolverError.message,
        );
      }
      return `pri_${id}`;
    }),
  };
});

import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/pricing"]}>{children}</MemoryRouter>;
}

// Real trackFunnelEvent runs here (funnelAnalytics is deliberately NOT
// mocked), so asserting on gtag exercises sanitizeFunnelParams and
// enforceFunnelEventSchema for real — proving the new reason tokens
// actually survive the ≤32-char / no-whitespace / key-allowlist filters
// rather than being silently dropped.
const gtagMock = vi.fn();

beforeEach(() => {
  navigateMock.mockReset();
  toastMock.mockReset();
  gtagMock.mockReset();
  state.resolverError = null;
  (window as any).gtag = gtagMock;
  (window as any).Paddle = { Checkout: { open: vi.fn() } };
});

function catalogUnavailableEvents() {
  return gtagMock.mock.calls.filter(
    (call) => call[0] === "event" && call[1] === "checkout_catalog_unavailable",
  );
}

describe("usePaddleCheckout — catalog-unavailable calm state", () => {
  it("price_resolution_unavailable (missing Craft price env var) lands as inline blockedReason, no destructive toast", async () => {
    state.resolverError = {
      reason: "price_resolution_unavailable",
      message:
        "Checkout is temporarily unavailable for this plan. Please try again in a moment or pick another plan.",
    };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "craft_monthly" });
    });

    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe(state.resolverError.message);
    expect(result.current.loading).toBe(false);
  });

  it("price_not_configured lands as inline blockedReason", async () => {
    state.resolverError = {
      reason: "price_not_configured",
      message: "This plan isn't set up for checkout yet.",
    };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "craft_annual" });
    });

    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe(state.resolverError.message);
  });

  it("unknown_plan lands as inline blockedReason", async () => {
    state.resolverError = {
      reason: "unknown_plan",
      message: "This plan isn't available for checkout yet.",
    };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "craft_monthly" });
    });

    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe(state.resolverError.message);
  });

  it("pack_requires_monthly_plan lands as calm inline guidance", async () => {
    state.resolverError = {
      reason: "pack_requires_monthly_plan",
      message:
        "Credit packs top up the monthly AI allowance that comes with a paid plan. Your current plan includes AI Doctor checks per grow instead.",
    };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "credit_pack_50" });
    });

    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe(state.resolverError.message);
    expect(result.current.loading).toBe(false);
  });

  it("generic resolver error still surfaces the destructive toast (regression guard)", async () => {
    state.resolverError = "generic";

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0].variant).toBe("destructive");
    expect(result.current.blockedReason).toBe(
      "Checkout couldn't open. You can leave your email for one availability notice instead.",
    );
  });
});

/**
 * Copilot round 1: the motivating regression is the MISSING
 * `checkout_catalog_unavailable` event, but nothing asserted the hook emits
 * it for the newly classified reasons — the mock union above did not even
 * contain them. Without this block, the PR's core claim ("every failure is
 * now visible in the funnel") was untested at the layer that does the
 * emitting.
 */
// #1278 finding 3. `blockedReasonCode` was asserted in exactly ONE test file —
// `pricing-checkout-blocked-no-reason-leak.test.tsx` — and that file mocks this
// hook. So nothing drove the real implementation: a hook that always returned
// `null` would keep every page test green while routing every failure back to
// configuration recovery, silently undoing the cause-aware panel. These tests
// exercise the real hook. Verified by mutation: stub the returned code to `null`
// and all four below fail.
describe("usePaddleCheckout — blockedReasonCode is produced, and cleared", () => {
  it("populates the sanitized reason code on a catalog failure", async () => {
    state.resolverError = {
      reason: "auth_required",
      message:
        "Verdant couldn't confirm you're still signed in, so checkout didn't open. Please sign in again, then choose your plan.",
    };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(result.current.blockedReasonCode).toBe("auth_required");
  });

  it("carries each client-classified reason through to the code, not just the message", async () => {
    for (const reason of [
      "price_gateway_unavailable",
      "price_request_failed",
      "price_response_unusable",
    ] as const) {
      state.resolverError = { reason, message: `calm copy for ${reason}` };
      const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
      await act(async () => {
        await result.current.openCheckout({ priceId: "pro_annual" });
      });
      expect(result.current.blockedReasonCode).toBe(reason);
    }
  });

  it("clears the code on dismiss", async () => {
    state.resolverError = {
      reason: "price_not_configured",
      message: "This plan isn't set up for checkout yet.",
    };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "craft_monthly" });
    });
    expect(result.current.blockedReasonCode).toBe("price_not_configured");

    act(() => {
      result.current.dismissBlocked();
    });
    expect(result.current.blockedReasonCode).toBeNull();
    expect(result.current.blockedReason).toBeNull();
  });

  it("clears the code on a fresh attempt, so a stale cause cannot frame a new failure", async () => {
    state.resolverError = {
      reason: "auth_required",
      message: "sign in again",
    };
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });
    expect(result.current.blockedReasonCode).toBe("auth_required");

    // Next attempt succeeds: the panel must not still claim an auth problem.
    state.resolverError = null;
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });
    expect(result.current.blockedReasonCode).toBeNull();
  });
});

describe("usePaddleCheckout — client-classified reasons stay calm AND reportable", () => {
  const CASES = [
    {
      reason: "auth_required" as const,
      plan: "pro_monthly",
      message:
        "Verdant couldn't confirm you're still signed in, so checkout didn't open. Please sign in again, then choose your plan.",
    },
    {
      reason: "price_gateway_unavailable" as const,
      plan: "pro_annual",
      message:
        "Checkout couldn't be reached just now, and nothing was charged. Please try again in a moment.",
    },
    {
      reason: "price_request_failed" as const,
      plan: "craft_monthly",
      message:
        "Verdant couldn't reach checkout from this device, and nothing was charged. Check your connection, then try again.",
    },
    {
      reason: "price_response_unusable" as const,
      plan: "craft_annual",
      message:
        "Checkout didn't return what Verdant needs to continue, and nothing was charged. Please try again in a moment.",
    },
  ];

  for (const testCase of CASES) {
    it(`${testCase.reason}: emits checkout_catalog_unavailable, calm blockedReason, no destructive toast`, async () => {
      state.resolverError = { reason: testCase.reason, message: testCase.message };

      const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
      await act(async () => {
        await result.current.openCheckout({ priceId: testCase.plan });
      });

      // 1. Reported — the half that was silent before this change.
      const events = catalogUnavailableEvents();
      expect(events).toHaveLength(1);
      expect(events[0][2]).toMatchObject({ plan: testCase.plan, reason: testCase.reason });

      // 2. Calm, not destructive.
      expect(toastMock).not.toHaveBeenCalled();
      expect(result.current.blockedReason).toBe(testCase.message);
      expect(result.current.loading).toBe(false);
    });
  }

  it("never routes a client-classified failure through the destructive toast", async () => {
    for (const testCase of CASES) {
      toastMock.mockReset();
      state.resolverError = { reason: testCase.reason, message: testCase.message };
      const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
      await act(async () => {
        await result.current.openCheckout({ priceId: testCase.plan });
      });
      expect(toastMock, `${testCase.reason} toasted`).not.toHaveBeenCalled();
    }
  });
});

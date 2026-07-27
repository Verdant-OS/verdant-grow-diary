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
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
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
  | "pack_requires_monthly_plan";

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

beforeEach(() => {
  navigateMock.mockReset();
  toastMock.mockReset();
  state.resolverError = null;
  (window as any).Paddle = { Checkout: { open: vi.fn() } };
});

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

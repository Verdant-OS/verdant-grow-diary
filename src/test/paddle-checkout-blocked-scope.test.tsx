/**
 * Codex P1 on #2230: a checkout-wide failure (Paddle.js load/initialize,
 * environment) blocks every plan, so it must not be bound to one SKU or keep
 * live trust copy. The hook reports the scope explicitly, derived from the
 * resolver's reason: "plan" for one price, "pack" for every credit pack, and
 * "checkout" for shared or unknown reasons and every non-catalog failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { ReactNode } from "react";

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "u@example.com" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const state = {
  env: "live" as "sandbox" | "live" | "unavailable",
  failure: null as null | "catalog" | "load" | "unavailable",
  reason: "price_not_configured",
};

vi.mock("@/lib/paddle", async () => {
  class PaddleCheckoutUnavailableError extends Error {}
  class PaddleCheckoutCatalogUnavailableError extends Error {
    constructor(
      readonly reason: string,
      readonly planId: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    PaddleCheckoutUnavailableError,
    PaddleCheckoutCatalogUnavailableError,
    resolvePaddleCheckout: () => state.env,
    resolvePaddleCheckoutBeforeHydration: () => state.env,
    getCheckoutUnavailableMessage: () =>
      state.env === "unavailable"
        ? "Live checkout is only available on verdantgrowdiary.com."
        : null,
    initializePaddle: vi.fn(async () => {
      if (state.failure === "load") throw new Error("Failed to load Paddle.js");
      if (state.failure === "unavailable") {
        throw new PaddleCheckoutUnavailableError("Checkout is currently unavailable.");
      }
    }),
    getPaddlePriceId: vi.fn(async (id: string) => {
      if (state.failure === "catalog") {
        throw new PaddleCheckoutCatalogUnavailableError(
          state.reason,
          id,
          "That plan isn't set up for checkout yet.",
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
  state.env = "live";
  state.failure = null;
  state.reason = "price_not_configured";
  window.sessionStorage.clear();
  (window as any).Paddle = { Checkout: { open: vi.fn() } };
});

async function attempt() {
  const hook = renderHook(() => usePaddleCheckout(), { wrapper });
  await act(async () => {
    await hook.result.current.openCheckout({ priceId: "craft_monthly" });
  });
  return hook.result;
}

describe("usePaddleCheckout blocked scope", () => {
  it("reports a catalog failure as plan-scoped", async () => {
    state.failure = "catalog";
    const result = await attempt();
    expect(result.current.blockedScope).toBe("plan");
    expect(result.current.blockedReasonCode).toBe("price_not_configured");
  });

  it("reports pack_requires_monthly_plan as pack-scoped", async () => {
    state.failure = "catalog";
    state.reason = "pack_requires_monthly_plan";
    const result = await attempt();
    expect(result.current.blockedScope).toBe("pack");
    expect(result.current.blockedReasonCode).toBe("pack_requires_monthly_plan");
  });

  it.each(["price_resolution_unavailable", "auth_required", "price_gateway_unavailable"])(
    "reports the shared catalog reason %s as checkout-wide",
    async (reason) => {
      state.failure = "catalog";
      state.reason = reason;
      const result = await attempt();
      expect(result.current.blockedScope).toBe("checkout");
      expect(result.current.blockedReasonCode).toBe(reason);
    },
  );

  it.each(["load", "unavailable"] as const)(
    "reports a %s failure as checkout-wide",
    async (failure) => {
      state.failure = failure;
      const result = await attempt();
      expect(result.current.blockedScope).toBe("checkout");
      expect(result.current.blockedReasonCode).toBeNull();
    },
  );

  it("reports an environment block as checkout-wide", async () => {
    state.env = "unavailable";
    const result = await attempt();
    expect(result.current.blockedScope).toBe("checkout");
  });

  it("clears the scope with the blocked state", async () => {
    state.failure = "load";
    const result = await attempt();
    expect(result.current.blockedScope).toBe("checkout");
    act(() => result.current.dismissBlocked());
    expect(result.current.blockedScope).toBeNull();
    expect(result.current.blockedReason).toBeNull();
  });
});

/**
 * #2028 Codex P2: Founder Lifetime is no longer sold. A stored
 * `founder_lifetime` checkout intent (saved before retirement, or carried by
 * an old link) must not open Paddle when the grower signs in: the hook's
 * resume path must hit the Founder refusal before any price lookup.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const paddle = vi.hoisted(() => ({
  initializePaddle: vi.fn(async () => {}),
  getPaddlePriceId: vi.fn(async (id: string) => `pri_${id}`),
}));

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "grower@example.com" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/paddle", () => {
  class PaddleCheckoutUnavailableError extends Error {}
  class PaddleCheckoutCatalogUnavailableError extends Error {}
  return {
    PaddleCheckoutUnavailableError,
    PaddleCheckoutCatalogUnavailableError,
    resolvePaddleCheckout: () => "sandbox",
    getCheckoutUnavailableMessage: () => null,
    initializePaddle: paddle.initializePaddle,
    getPaddlePriceId: paddle.getPaddlePriceId,
  };
});

import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { peekPlanIntent, savePlanIntent } from "@/lib/checkoutPlanIntent";
import { FOUNDER_LIFETIME_CHECKOUT_REFUSAL } from "@/lib/founderLifetimeCheckoutGuard";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/pricing"]}>{children}</MemoryRouter>;
}

const paddleOpen = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  paddle.initializePaddle.mockClear();
  paddle.getPaddlePriceId.mockClear();
  paddleOpen.mockClear();
  (window as unknown as { Paddle: unknown }).Paddle = { Checkout: { open: paddleOpen } };
});

describe("a stored Founder intent cannot reopen checkout", () => {
  it("is consumed on sign-in and refused before any Paddle work", async () => {
    expect(savePlanIntent("founder_lifetime")).toBe(true);
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(peekPlanIntent()).toBeNull();
    expect(result.current.blockedReason).toBe(FOUNDER_LIFETIME_CHECKOUT_REFUSAL);
    expect(paddle.getPaddlePriceId).not.toHaveBeenCalled();
    expect(paddle.initializePaddle).not.toHaveBeenCalled();
    expect(paddleOpen).not.toHaveBeenCalled();
  });
});

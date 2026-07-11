/**
 * Slice C — usePaddleCheckout plan-intent survival across /auth.
 *
 * Verifies:
 *   - Signed-out openCheckout() saves a typed plan intent and redirects
 *     to /auth with a returnTo pointing back to the pricing page.
 *   - Once the user becomes present, the hook consumes the intent EXACTLY
 *     ONCE and opens the Paddle overlay with the same plan.
 *   - StrictMode-style double render / rerender does not re-open checkout.
 *   - Unknown priceIds are NOT saved as intent (allowlist gate).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

const authState = {
  user: null as null | { id: string; email: string },
};
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

vi.mock("@/lib/paddle", () => {
  class PaddleCheckoutUnavailableError extends Error {}
  return {
    PaddleCheckoutUnavailableError,
    resolvePaddleCheckout: () => "sandbox",
    getCheckoutUnavailableMessage: () => null,
    initializePaddle: vi.fn(async () => {}),
    getPaddlePriceId: vi.fn(async (id: string) => `pri_${id}`),
  };
});

import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import {
  CHECKOUT_PLAN_INTENT_STORAGE_KEY,
  peekPlanIntent,
} from "@/lib/checkoutPlanIntent";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/pricing"]}>{children}</MemoryRouter>;
}

beforeEach(() => {
  navigateMock.mockReset();
  authState.user = null;
  window.sessionStorage.clear();
  (window as any).Paddle = { Checkout: { open: vi.fn() } };
});

describe("usePaddleCheckout — Slice C plan intent survives /auth", () => {
  it("saves plan intent and redirects to /auth when signed-out", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });

    expect(peekPlanIntent()).toBe("pro_annual");
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const target = navigateMock.mock.calls[0][0] as string;
    expect(target.startsWith("/auth?redirectTo=")).toBe(true);
    expect(decodeURIComponent(target)).toContain("/pricing");
  });

  it("does NOT save intent for an unknown priceId (allowlist gate)", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    await act(async () => {
      await result.current.openCheckout({ priceId: "hacker_forever" });
    });

    expect(window.sessionStorage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("auto-resumes exactly once when user becomes present with a pending intent", async () => {
    // Simulate: prior signed-out click stored an intent.
    window.sessionStorage.setItem(
      CHECKOUT_PLAN_INTENT_STORAGE_KEY,
      JSON.stringify({ plan: "pro_monthly", savedAt: Date.now() }),
    );
    // Now the user is signed in on this render.
    authState.user = { id: "u-1", email: "u@example.com" };

    const openSpy = vi.fn();
    (window as any).Paddle = { Checkout: { open: openSpy } };

    const { rerender } = renderHook(() => usePaddleCheckout(), { wrapper });

    // Let the resume effect + async openCheckout settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0][0].items[0].priceId).toBe("pri_pro_monthly");
    // Intent is consumed — a rerender must not re-open checkout.
    expect(window.sessionStorage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();

    rerender();
    await act(async () => {
      await Promise.resolve();
    });
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("does not auto-resume when there is no pending intent", async () => {
    authState.user = { id: "u-1", email: "u@example.com" };
    const openSpy = vi.fn();
    (window as any).Paddle = { Checkout: { open: openSpy } };

    renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(openSpy).not.toHaveBeenCalled();
  });
});

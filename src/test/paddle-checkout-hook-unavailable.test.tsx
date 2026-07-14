/**
 * Slice B — usePaddleCheckout calm-blocked behavior.
 *
 * Verifies the hook:
 *   - refuses to open checkout when the environment resolves to "unavailable"
 *   - surfaces `unavailable`, `unavailableMessage`, and `blockedReason`
 *     without navigating to /auth and without a destructive toast
 *   - dismissBlocked() clears the calm state
 *   - a thrown PaddleCheckoutUnavailableError from initializePaddle also
 *     lands in the calm blocked state, not a destructive toast
 *   - non-fail-closed errors still surface via toast (regression guard)
 *   - available environment continues to open Paddle overlay normally
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// ---- Module mocks (declared BEFORE importing the hook) ---------------------

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

// The Paddle module is mocked so we can flip environment state per-test
// without touching real window.location or import.meta.env.
const paddleState = {
  env: "sandbox" as "sandbox" | "live" | "unavailable",
  message: null as string | null,
  initShouldThrow: null as null | "unavailable" | "generic",
};

vi.mock("@/lib/paddle", async () => {
  class PaddleCheckoutUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PaddleCheckoutUnavailableError";
    }
  }
  return {
    PaddleCheckoutUnavailableError,
    resolvePaddleCheckout: () => paddleState.env,
    getCheckoutUnavailableMessage: () => paddleState.message,
    initializePaddle: vi.fn(async () => {
      if (paddleState.initShouldThrow === "unavailable") {
        throw new PaddleCheckoutUnavailableError(
          "Checkout disabled: localhost requires a Paddle sandbox token.",
        );
      }
      if (paddleState.initShouldThrow === "generic") {
        throw new Error("Failed to load Paddle.js");
      }
    }),
    getPaddlePriceId: vi.fn(async (id: string) => `pri_${id}`),
  };
});

import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/pricing"]}>{children}</MemoryRouter>;
}

beforeEach(() => {
  navigateMock.mockReset();
  toastMock.mockReset();
  paddleState.env = "sandbox";
  paddleState.message = null;
  paddleState.initShouldThrow = null;
  // Ensure window.Paddle stub exists for the success path.
  (window as any).Paddle = { Checkout: { open: vi.fn() } };
});

describe("usePaddleCheckout — Slice B calm-blocked behavior", () => {
  it("exposes unavailable=true and the blocking message when environment is unavailable", () => {
    paddleState.env = "unavailable";
    paddleState.message = "Checkout disabled: localhost requires a Paddle sandbox token.";

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    expect(result.current.unavailable).toBe(true);
    expect(result.current.unavailableMessage).toBe(
      "Checkout disabled: localhost requires a Paddle sandbox token.",
    );
    expect(result.current.blockedReason).toBeNull();
  });

  it("refuses to open checkout when unavailable — no /auth redirect, no toast, calm blockedReason", async () => {
    paddleState.env = "unavailable";
    paddleState.message = "Checkout disabled: localhost requires a Paddle sandbox token.";

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe(
      "Checkout disabled: localhost requires a Paddle sandbox token.",
    );
    // Loading must not stay stuck on true after the calm short-circuit.
    expect(result.current.loading).toBe(false);
  });

  it("dismissBlocked() clears the calm blocked state", async () => {
    paddleState.env = "unavailable";
    paddleState.message = "Checkout disabled: localhost requires a Paddle sandbox token.";

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });
    expect(result.current.blockedReason).not.toBeNull();

    act(() => result.current.dismissBlocked());
    expect(result.current.blockedReason).toBeNull();
  });

  it("PaddleCheckoutUnavailableError from initializePaddle lands as calm blockedReason, not destructive toast", async () => {
    // Environment reads as sandbox at the top-of-hook gate (so we get past
    // the pre-check) but initializePaddle throws PaddleCheckoutUnavailableError
    // — simulates a race where the token was cleared between renders.
    paddleState.env = "sandbox";
    paddleState.initShouldThrow = "unavailable";

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.blockedReason).toBe(
      "Checkout disabled: localhost requires a Paddle sandbox token.",
    );
  });

  it("non-fail-closed errors surface a toast and a recoverable paid-intent path", async () => {
    paddleState.env = "sandbox";
    paddleState.initShouldThrow = "generic";

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0][0];
    expect(call.variant).toBe("destructive");
    expect(call.title).toBe("Checkout unavailable");
    expect(result.current.blockedReason).toBe(
      "Checkout couldn't open. You can leave your email for one availability notice instead.",
    );
  });

  it("available sandbox environment opens Paddle overlay and does not enter blocked state", async () => {
    paddleState.env = "sandbox";

    const openSpy = vi.fn();
    (window as any).Paddle = { Checkout: { open: openSpy } };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });

    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    const args = openSpy.mock.calls[0][0];
    expect(args.items[0].priceId).toBe("pri_pro_annual");
    expect(args.customData).toEqual({ userId: "user-1" });
    expect(result.current.blockedReason).toBeNull();
    expect(result.current.unavailable).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

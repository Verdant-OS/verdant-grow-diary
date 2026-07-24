/**
 * Slice D — usePaddleCheckout overlay cancel wiring.
 *
 * Verifies:
 *   - Opening checkout registers a module-level session BEFORE
 *     Paddle.Checkout.open is called.
 *   - A subsequent `checkout.closed` event (without prior completion) routes
 *     the buyer to /checkout/cancel via useNavigate.
 *   - `checkout.completed` followed by `checkout.closed` does NOT navigate
 *     to /checkout/cancel (Paddle handles the successUrl redirect).
 *   - The cancel handler no-ops when the hook has unmounted.
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
  useAuth: () => ({ user: { id: "u-1", email: "u@example.com" } }),
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
  handlePaddleCheckoutEvent,
  _peekActiveSessionForTests,
  _resetCheckoutOverlaySessionForTests,
} from "@/lib/checkoutOverlaySession";
import { readCheckoutStartedAt } from "@/lib/checkoutContextRules";

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/pricing"]}>{children}</MemoryRouter>;
}

function wrapperWithReturnTo({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/pricing?returnTo=%2Fpheno-hunts%2Fnew"]}>
      {children}
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  _resetCheckoutOverlaySessionForTests();
  window.sessionStorage.clear();
  (window as any).Paddle = { Checkout: { open: vi.fn() } };
});

describe("usePaddleCheckout — Slice D overlay cancel wiring", () => {
  it("registers a checkout session before Paddle.Checkout.open", async () => {
    const openSpy = vi.fn(() => {
      // At the moment Paddle.Checkout.open is invoked, an active session
      // must already exist so the eventCallback has a target.
      expect(_peekActiveSessionForTests()).not.toBeNull();
    });
    (window as any).Paddle = { Checkout: { open: openSpy } };

    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(_peekActiveSessionForTests()).not.toBeNull();
  });

  it("routes to /checkout/cancel on checkout.closed without completion", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });

    act(() => handlePaddleCheckoutEvent({ name: "checkout.closed" }));
    expect(navigateMock).toHaveBeenCalledWith("/checkout/cancel?plan=pro_annual");
  });

  it("preserves a sanitized return path in the cancel recovery route", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), {
      wrapper: wrapperWithReturnTo,
    });
    await act(async () => {
      await result.current.openCheckout({ priceId: "founder_lifetime" });
    });

    act(() => handlePaddleCheckoutEvent({ name: "checkout.closed" }));
    expect(navigateMock).toHaveBeenCalledWith(
      "/checkout/cancel?plan=founder_lifetime&returnTo=%2Fpheno-hunts%2Fnew",
    );
  });

  it("does NOT route to /checkout/cancel when completion precedes close", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });

    act(() => {
      handlePaddleCheckoutEvent({ name: "checkout.completed" });
      handlePaddleCheckoutEvent({ name: "checkout.closed" });
    });
    expect(
      navigateMock.mock.calls.some(([path]) => String(path).startsWith("/checkout/cancel")),
    ).toBe(false);
  });

  it("clears the same-device checkout marker on close-before-completion", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });
    // Opening wrote the marker…
    expect(readCheckoutStartedAt(window.sessionStorage)).not.toBeNull();

    act(() => handlePaddleCheckoutEvent({ name: "checkout.closed" }));
    // …but a cancelled checkout must not leave context behind, or a later
    // direct /checkout/success visit would poll as "confirming".
    expect(readCheckoutStartedAt(window.sessionStorage)).toBeNull();
  });

  it("keeps the marker when completion precedes close (real success path)", async () => {
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_annual" });
    });

    act(() => {
      handlePaddleCheckoutEvent({ name: "checkout.completed" });
      handlePaddleCheckoutEvent({ name: "checkout.closed" });
    });
    // The successUrl redirect needs this context; /checkout/success clears
    // it once the entitlement resolver confirms.
    expect(readCheckoutStartedAt(window.sessionStorage)).not.toBeNull();
  });

  it("clears the marker when Paddle.Checkout.open throws", async () => {
    (window as any).Paddle = {
      Checkout: {
        open: vi.fn(() => {
          throw new Error("overlay exploded");
        }),
      },
    };
    const { result } = renderHook(() => usePaddleCheckout(), { wrapper });
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });
    // The failed open never reached checkout — no context may remain.
    expect(readCheckoutStartedAt(window.sessionStorage)).toBeNull();
  });

  it("cancel callback no-ops when the hook has unmounted", async () => {
    const { result, unmount } = renderHook(() => usePaddleCheckout(), {
      wrapper,
    });
    await act(async () => {
      await result.current.openCheckout({ priceId: "founder_lifetime" });
    });

    unmount();
    act(() => handlePaddleCheckoutEvent({ name: "checkout.closed" }));
    expect(
      navigateMock.mock.calls.some(([path]) => String(path).startsWith("/checkout/cancel")),
    ).toBe(false);
  });
});

// @vitest-environment-options {"url":"https://verdantgrowdiary.com/pricing"}
/**
 * Module and hook behavior for a live token on the production hostname. This
 * file runs with the page URL set to https://verdantgrowdiary.com/ so
 * `window.location.hostname` is the real production host.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

async function loadPaddleWithToken(token: string, checkoutDisabled?: string) {
  vi.resetModules();
  vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", token);
  if (checkoutDisabled !== undefined) vi.stubEnv("VITE_CHECKOUT_DISABLED", checkoutDisabled);
  return import("@/lib/paddle");
}

beforeEach(() => {
  invokeMock.mockReset();
  document.querySelectorAll('script[data-paddle-loader="true"]').forEach((node) => node.remove());
  delete (window as any).Paddle;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("live token on the production hostname", () => {
  it("runs on the production hostname", () => {
    expect(window.location.hostname).toBe("verdantgrowdiary.com");
  });

  it("resolves live checkout, live entitlement reads and no blocking copy", async () => {
    const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000");
    expect(paddle.resolvePaddleCheckout()).toBe("live");
    expect(paddle.getPaddleEnvironment()).toBe("live");
    expect(paddle.getCheckoutUnavailableMessage()).toBeNull();
  });

  it("initializes Paddle in the SDK's production environment", async () => {
    const script = document.createElement("script");
    script.dataset.paddleLoader = "true";
    document.head.appendChild(script);
    const environmentSet = vi.fn();
    const initialize = vi.fn();
    (window as any).Paddle = {
      Environment: { set: environmentSet },
      Initialize: initialize,
      Checkout: { open: vi.fn() },
    };

    const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000");
    await paddle.initializePaddle();

    // The SDK names live "production"; the explicit call keeps a stale
    // sandbox setting from surviving on the production host.
    expect(environmentSet.mock.calls).toEqual([["production"]]);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize.mock.calls[0]?.[0]?.token).toBe("live_fixturetokenpayload00000000");
  });

  it("asks the price resolver with the live environment label", async () => {
    invokeMock.mockResolvedValue({ data: { paddleId: "pri_live_fixture" }, error: null });
    const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000");

    await expect(paddle.getPaddlePriceId("pro_monthly")).resolves.toBe("pri_live_fixture");
    expect(invokeMock).toHaveBeenCalledWith("get-paddle-price", {
      body: { priceId: "pro_monthly", environment: "live" },
    });
  });

  it("keeps a test token on sandbox entitlement reads and the sandbox override", async () => {
    const script = document.createElement("script");
    script.dataset.paddleLoader = "true";
    document.head.appendChild(script);
    const environmentSet = vi.fn();
    (window as any).Paddle = {
      Environment: { set: environmentSet },
      Initialize: vi.fn(),
      Checkout: { open: vi.fn() },
    };

    const paddle = await loadPaddleWithToken("test_fixturetokenpayload00000000");
    expect(paddle.resolvePaddleCheckout()).toBe("sandbox");
    expect(paddle.getPaddleEnvironment()).toBe("sandbox");
    await paddle.initializePaddle();
    expect(environmentSet.mock.calls).toEqual([["sandbox"]]);
  });

  it("server-renders and hydrates the banner with no mismatch and no banner on the production host", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "live_fixturetokenpayload00000000");
    const { PaymentTestModeBanner } = await import("@/components/PaymentTestModeBanner");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      container.innerHTML = renderToString(<PaymentTestModeBanner />);
      expect(container.innerHTML).toBe("");
      const recoverable = vi.fn();
      await act(async () => {
        hydrateRoot(container, <PaymentTestModeBanner />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe("");
    } finally {
      container.remove();
    }
  });

  it("does not mark checkout unavailable in the hook", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "live_fixturetokenpayload00000000");
    vi.doMock("@/store/auth", () => ({ useAuth: () => ({ user: null }) }));
    vi.doMock("@/lib/react-router-compat", () => ({
      useNavigate: () => vi.fn(),
      useLocation: () => ({ pathname: "/pricing", search: "", hash: "" }),
    }));
    const { usePaddleCheckout } = await import("@/hooks/usePaddleCheckout");
    const { result } = renderHook(() => usePaddleCheckout());
    expect(result.current.environment).toBe("live");
    expect(result.current.unavailable).toBe(false);
    expect(result.current.unavailableMessage).toBeNull();
  });
});

/**
 * Rollback artifact: the same live token and production hostname, built with
 * VITE_CHECKOUT_DISABLED="true". Checkout must be unavailable on the real
 * production host with no Paddle.js load, no price lookup and no charge path,
 * while entitlement reads stay live.
 */
describe("checkout-disabled rollback artifact on the production hostname", () => {
  it("resolves unavailable with the paused message and keeps live entitlement reads", async () => {
    const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000", "true");
    expect(window.location.hostname).toBe("verdantgrowdiary.com");
    expect(paddle.isPaddleCheckoutPaused()).toBe(true);
    expect(paddle.resolvePaddleCheckout()).toBe("unavailable");
    expect(paddle.resolvePaddleCheckoutBeforeHydration()).toBe("unavailable");
    expect(paddle.getCheckoutUnavailableMessage()).toBe(
      "New checkout is paused. Existing plans, renewals and billing management are not affected.",
    );
    expect(paddle.getPaddleEnvironment()).toBe("live");
  });

  it("refuses to initialize without loading Paddle.js", async () => {
    const appendSpy = vi.spyOn(document.head, "appendChild");
    const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000", "true");
    await expect(paddle.initializePaddle()).rejects.toBeInstanceOf(
      paddle.PaddleCheckoutUnavailableError,
    );
    expect(appendSpy).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-paddle-loader="true"]')).toBeNull();
    expect((window as any).Paddle).toBeUndefined();
  });

  it("refuses a price lookup without calling the resolver", async () => {
    const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000", "true");
    await expect(paddle.getPaddlePriceId("pro_monthly")).rejects.toBeInstanceOf(
      paddle.PaddleCheckoutUnavailableError,
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it.each(["false", "", "1", "TRUE ", "true ", " true", "\ttrue", "true\n", " true "])(
    "treats VITE_CHECKOUT_DISABLED=%j as not disabled",
    async (value) => {
      const paddle = await loadPaddleWithToken("live_fixturetokenpayload00000000", value);
      expect(paddle.resolvePaddleCheckout()).toBe("live");
    },
  );

  it("server-renders and hydrates the paused banner with no mismatch", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "live_fixturetokenpayload00000000");
    vi.stubEnv("VITE_CHECKOUT_DISABLED", "true");
    const { PaymentTestModeBanner } = await import("@/components/PaymentTestModeBanner");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      container.innerHTML = renderToString(<PaymentTestModeBanner />);
      expect(container.textContent).toContain("New checkout is paused.");
      const recoverable = vi.fn();
      await act(async () => {
        hydrateRoot(container, <PaymentTestModeBanner />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      const banner = container.querySelector('[data-testid="payments-unavailable-banner"]');
      expect(banner?.textContent).toContain("New checkout is paused.");
    } finally {
      container.remove();
    }
  });

  it("blocks checkout in the hook before any Paddle call", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "live_fixturetokenpayload00000000");
    vi.stubEnv("VITE_CHECKOUT_DISABLED", "true");
    vi.doMock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
    vi.doMock("@/lib/react-router-compat", () => ({
      useNavigate: () => vi.fn(),
      useLocation: () => ({ pathname: "/pricing", search: "", hash: "" }),
    }));
    const { usePaddleCheckout } = await import("@/hooks/usePaddleCheckout");
    const { act } = await import("react");
    const { result } = renderHook(() => usePaddleCheckout());
    expect(result.current.environment).toBe("unavailable");
    expect(result.current.unavailable).toBe(true);
    await act(async () => {
      await result.current.openCheckout({ priceId: "pro_monthly" });
    });
    expect(result.current.blockedScope).toBe("checkout");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(document.querySelector('script[data-paddle-loader="true"]')).toBeNull();
  });
});

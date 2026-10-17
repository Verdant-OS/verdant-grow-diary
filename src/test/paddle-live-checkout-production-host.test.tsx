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

async function loadPaddleWithToken(token: string) {
  vi.resetModules();
  vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", token);
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
    const paddle = await loadPaddleWithToken("live_fixture_token_payload");
    expect(paddle.resolvePaddleCheckout()).toBe("live");
    expect(paddle.getPaddleEnvironment()).toBe("live");
    expect(paddle.getCheckoutUnavailableMessage()).toBeNull();
  });

  it("initializes Paddle without forcing the sandbox environment", async () => {
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

    const paddle = await loadPaddleWithToken("live_fixture_token_payload");
    await paddle.initializePaddle();

    expect(environmentSet).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize.mock.calls[0]?.[0]?.token).toBe("live_fixture_token_payload");
  });

  it("asks the price resolver with the live environment label", async () => {
    invokeMock.mockResolvedValue({ data: { paddleId: "pri_live_fixture" }, error: null });
    const paddle = await loadPaddleWithToken("live_fixture_token_payload");

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

    const paddle = await loadPaddleWithToken("test_fixture_token_payload");
    expect(paddle.resolvePaddleCheckout()).toBe("sandbox");
    expect(paddle.getPaddleEnvironment()).toBe("sandbox");
    await paddle.initializePaddle();
    expect(environmentSet.mock.calls).toEqual([["sandbox"]]);
  });

  it("server-renders and hydrates the banner with no mismatch and no banner on the production host", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "live_fixture_token_payload");
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
    vi.stubEnv("VITE_PAYMENTS_CLIENT_TOKEN", "live_fixture_token_payload");
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

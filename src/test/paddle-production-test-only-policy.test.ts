import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyPaddleToken } from "@/lib/paddleEnvironment";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

function readProductionToken(): string | null {
  const text = readFileSync(resolve(process.cwd(), ".env.production"), "utf8");
  const line = text
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("VITE_PAYMENTS_CLIENT_TOKEN="));
  if (!line) return null;
  const raw = line.slice(line.indexOf("=") + 1).trim();
  return raw.replace(/^(["'])(.*)\1$/, "$2");
}

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

describe("Paddle production test-only policy", () => {
  it("tracks a sandbox-class client token in the production build", () => {
    expect(classifyPaddleToken(readProductionToken())).toBe("sandbox");
  });

  it("initializes only the Paddle sandbox environment", async () => {
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

    const paddle = await loadPaddleWithToken("test_policy_fixture");
    await paddle.initializePaddle();

    expect(environmentSet).toHaveBeenCalledTimes(1);
    expect(environmentSet.mock.calls[0]).toEqual(["sandbox"]);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it("blocks a live token before script loading or price resolution", async () => {
    const appendChild = vi.spyOn(document.head, "appendChild");
    const paddle = await loadPaddleWithToken("live_policy_fixture");

    expect(paddle.resolvePaddleCheckout()).toBe("unavailable");
    expect(paddle.getPaddleEnvironment()).toBe("sandbox");
    await expect(paddle.initializePaddle()).rejects.toBeInstanceOf(
      paddle.PaddleCheckoutUnavailableError,
    );
    await expect(paddle.getPaddlePriceId("pro_monthly")).rejects.toBeInstanceOf(
      paddle.PaddleCheckoutUnavailableError,
    );
    expect(appendChild).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(paddle.getCheckoutUnavailableMessage()).toContain("sandbox testing only");
  });
});

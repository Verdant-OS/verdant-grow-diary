import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { classifyPaddleToken } from "@/lib/paddleEnvironment";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

function readProductionToken(envDir = process.cwd()): string | null {
  return loadEnv("production", envDir, "VITE_PAYMENTS_").VITE_PAYMENTS_CLIENT_TOKEN ?? null;
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
  it("tracks a sandbox or live class client token in the production build", () => {
    // Standing production prebuild gate: Lovable publish may inject live_.
    // Checkout runtime remaining sandbox-authorized is a separate slice.
    expect(["sandbox", "live"]).toContain(classifyPaddleToken(readProductionToken()));
  });

  it("reads the same last duplicate assignment that Vite resolves for production", () => {
    const envDir = mkdtempSync(resolve(tmpdir(), "verdant-paddle-production-env-"));
    const envFile = resolve(envDir, ".env.production");
    const previousToken = process.env.VITE_PAYMENTS_CLIENT_TOKEN;
    delete process.env.VITE_PAYMENTS_CLIENT_TOKEN;
    try {
      writeFileSync(
        envFile,
        [
          "VITE_PAYMENTS_CLIENT_TOKEN=test_policy_first",
          "VITE_PAYMENTS_CLIENT_TOKEN=live_policy_last",
          "",
        ].join("\n"),
        "utf8",
      );

      expect(classifyPaddleToken(readProductionToken(envDir))).toBe("live");
    } finally {
      if (previousToken === undefined) delete process.env.VITE_PAYMENTS_CLIENT_TOKEN;
      else process.env.VITE_PAYMENTS_CLIENT_TOKEN = previousToken;
      rmSync(envFile, { force: true });
      rmdirSync(envDir);
    }
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const trackFunnelEvent = vi.hoisted(() => vi.fn());
const legacyPaddleEnv = vi.hoisted(() => ({ clientToken: "" }));

vi.mock("@/hooks/usePaddleCheckout", () => ({
  usePaddleCheckout: () => ({ openCheckout: vi.fn(), loading: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { displayPlanId: null },
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

vi.mock("@/components/PhenoTrackerPreviewCard", () => ({
  default: () => null,
}));

vi.mock("@/lib/paddleConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/paddleConfig")>("@/lib/paddleConfig");
  return {
    ...actual,
    resolvePaddleConfig: () =>
      actual.resolvePaddleConfig({
        VITE_PADDLE_ENVIRONMENT: "sandbox",
        VITE_PADDLE_CLIENT_TOKEN: legacyPaddleEnv.clientToken,
        VITE_PADDLE_PRICE_PRO_MONTHLY: "pri_sandbox_pro_monthly",
        VITE_PADDLE_PRICE_PRO_ANNUAL: "pri_sandbox_pro_annual",
        VITE_PADDLE_PRICE_FOUNDER_LIFETIME: "pri_sandbox_founder",
      }),
  };
});

import Upgrade from "@/pages/Upgrade";

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

async function captureUpgradePaddleSideEffects(clientToken: string) {
  legacyPaddleEnv.clientToken = clientToken;

  const environmentSet = vi.fn();
  const initialize = vi.fn();
  (window as any).Paddle = {
    Environment: { set: environmentSet },
    Initialize: initialize,
  };

  const appendChild = vi.spyOn(document.head, "appendChild");
  render(
    <MemoryRouter initialEntries={["/upgrade"]}>
      <Upgrade />
    </MemoryRouter>,
  );

  const script = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_JS_SRC}"]`);
  if (script) fireEvent.load(script);

  const paddleScriptAppends = appendChild.mock.calls.filter(
    ([node]) => node instanceof HTMLScriptElement && node.src === PADDLE_JS_SRC,
  ).length;

  return {
    paddleScriptAppends,
    environmentSetCalls: environmentSet.mock.calls.length,
    initializeCalls: initialize.mock.calls.length,
  };
}

beforeEach(() => {
  trackFunnelEvent.mockReset();
  legacyPaddleEnv.clientToken = "";
  delete (window as any).Paddle;
  document.querySelectorAll(`script[src="${PADDLE_JS_SRC}"]`).forEach((node) => node.remove());
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as any).Paddle;
  document.querySelectorAll(`script[src="${PADDLE_JS_SRC}"]`).forEach((node) => node.remove());
});

describe("Upgrade legacy Paddle loader fail-closed policy", () => {
  it.each([
    ["live-class", "live_policy_fixture"],
    ["malformed-class", "malformed_policy_fixture"],
  ])("blocks a %s token before every Paddle.js side effect", async (_tokenClass, token) => {
    expect(await captureUpgradePaddleSideEffects(token)).toEqual({
      paddleScriptAppends: 0,
      environmentSetCalls: 0,
      initializeCalls: 0,
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetPostHogClientForTests, syncPostHogWithConsent } from "@/lib/posthogClient";

const FIXTURE_KEY = "phc_test_fixture_not_a_real_key";

const { sdk } = vi.hoisted(() => ({
  sdk: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => false),
    stopSessionRecording: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("posthog-js", () => ({ default: sdk }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

const originalLocation = window.location;

describe("PostHog persisted opt-out", () => {
  beforeEach(() => {
    __resetPostHogClientForTests();
    sdk.init.mockClear();
    sdk.capture.mockClear();
    sdk.identify.mockClear();
    sdk.opt_in_capturing.mockClear();
    sdk.opt_out_capturing.mockClear();
    sdk.has_opted_out_capturing.mockReset();
    sdk.has_opted_out_capturing.mockReturnValue(false);
    sdk.stopSessionRecording.mockClear();
    sdk.reset.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        hostname: "verdantgrowdiary.com",
        pathname: "/",
        search: "",
        hash: "",
        protocol: "https:",
        origin: "https://verdantgrowdiary.com",
        href: "https://verdantgrowdiary.com/",
      },
    });
  });

  afterEach(() => {
    __resetPostHogClientForTests();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("opts back in after init when the SDK still has a persisted opt-out", async () => {
    sdk.has_opted_out_capturing.mockReturnValue(true);
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk: async () => sdk, readEnv: () => ({ key: FIXTURE_KEY, host: "" }) },
    );
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(sdk.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.opt_in_capturing.mock.invocationCallOrder[0],
    );
    expect(sdk.opt_in_capturing.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.capture.mock.invocationCallOrder[0],
    );
    expect(sdk.capture).toHaveBeenCalledWith("$pageview", {
      $pathname: "/",
      $current_url: "https://verdantgrowdiary.com/",
    });
  });

  it("does not opt in again when the fresh SDK is already capturing", async () => {
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk: async () => sdk, readEnv: () => ({ key: FIXTURE_KEY, host: "" }) },
    );
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(sdk.has_opted_out_capturing).toHaveBeenCalled();
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled();
    expect(sdk.capture).toHaveBeenCalledTimes(1);
  });
});

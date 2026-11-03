import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetPostHogClientForTests, syncPostHogWithConsent } from "@/lib/posthogClient";
import { buildContentSecurityPolicyReportOnly } from "@/lib/securityHeadersRules";

const FIXTURE_KEY = "phc_test_fixture_not_a_real_key";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  stopSessionRecording: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: sdk }));

const originalLocation = window.location;

function setProductionHost() {
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
}

describe("PostHog startup from VITE_POSTHOG_KEY", () => {
  beforeEach(() => {
    __resetPostHogClientForTests();
    sdk.init.mockClear();
    setProductionHost();
    vi.stubEnv("VITE_POSTHOG_KEY", FIXTURE_KEY);
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
  });

  afterEach(() => {
    __resetPostHogClientForTests();
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("initialises when the key is set and analytics consent is granted", async () => {
    syncPostHogWithConsent("granted", { pathname: "/", search: "", hash: "" });
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(sdk.init).toHaveBeenCalledWith(
      FIXTURE_KEY,
      expect.objectContaining({ api_host: "https://us.i.posthog.com" }),
    );
  });

  it("stays off without consent even when the key is set", async () => {
    syncPostHogWithConsent("unset", { pathname: "/", search: "", hash: "" });
    syncPostHogWithConsent("denied", { pathname: "/", search: "", hash: "" });
    await Promise.resolve();
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it("lists the ingestion host and the SDK asset host on the report-only policy", () => {
    const csp = buildContentSecurityPolicyReportOnly();
    expect(csp).toContain("https://us.i.posthog.com");
    expect(csp).toContain("https://us-assets.i.posthog.com");
  });
});

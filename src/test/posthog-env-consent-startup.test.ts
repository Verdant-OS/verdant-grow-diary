import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
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
    await vi.dynamicImportSettled();
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it("keeps a non-empty public client key in the committed env file", () => {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    const line = text.split("\n").find((row) => row.startsWith("VITE_POSTHOG_KEY="));
    const value = (line ?? "").slice("VITE_POSTHOG_KEY=".length).replaceAll('"', "").trim();
    expect(Boolean(line) && value.startsWith("phc_") && value.length > "phc_".length).toBe(true);
  });

  it("lists the ingestion host on connect-src and the SDK asset host on script-src", () => {
    const csp = buildContentSecurityPolicyReportOnly();
    const connectSrc = directive(csp, "connect-src");
    const scriptSrc = directive(csp, "script-src");
    expect(connectSrc).toContain("https://us.i.posthog.com");
    expect(connectSrc).toContain("https://us-assets.i.posthog.com");
    expect(scriptSrc).toContain("https://us-assets.i.posthog.com");
  });
});

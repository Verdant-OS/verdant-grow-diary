import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";

const syncPostHogWithConsent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthogClient", () => ({
  syncPostHogWithConsent,
}));

describe("analytics consent runtime PostHog wiring", () => {
  const landing = { pathname: "/", search: "", hash: "" };

  beforeEach(() => {
    syncPostHogWithConsent.mockClear();
    document.head.innerHTML = "";
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
    delete (window as unknown as Record<string, unknown>)[
      `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
    ];
  });

  afterEach(() => {
    document.head.innerHTML = "";
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
  });

  it("passes the consent decision through and leaves the Google Analytics return value unchanged", () => {
    expect(applyAnalyticsConsentDecision("unset", landing)).toBe(false);
    expect(syncPostHogWithConsent).toHaveBeenCalledWith("unset", landing);

    syncPostHogWithConsent.mockClear();
    expect(applyAnalyticsConsentDecision("granted", landing)).toBe(false);
    expect(syncPostHogWithConsent).toHaveBeenCalledWith("granted", landing);
    expect(
      document.querySelector(
        `script[src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`,
      ),
    ).not.toBeNull();

    syncPostHogWithConsent.mockClear();
    expect(applyAnalyticsConsentDecision("denied", landing)).toBe(true);
    expect(syncPostHogWithConsent).toHaveBeenCalledWith("denied", landing);
  });

  it("stops PostHog on the toolkit route without a second call", () => {
    const toolkit = { pathname: GROW_HELP_TOOLKIT_PATH, search: "", hash: "" };
    expect(applyAnalyticsConsentDecision("granted", toolkit)).toBe(false);
    expect(syncPostHogWithConsent).toHaveBeenCalledTimes(1);
    expect(syncPostHogWithConsent).toHaveBeenCalledWith("denied", toolkit);
  });
});

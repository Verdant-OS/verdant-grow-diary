// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://verdantgrowdiary.com/"}
// GA only collects on the production host (#2693), so these run there.
import { afterEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  __resetAnalyticsConsentForTests,
  readAnalyticsConsent,
} from "@/lib/analyticsConsent";
import { tearDownAnalyticsForExcludedRoute } from "@/lib/analyticsConsentRuntime";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { AHREFS_WEB_ANALYTICS_KEY, GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const TOOLKIT = {
  pathname: GROW_HELP_TOOLKIT_PATH,
  search: "",
  hash: "",
} as const;

const LANDING = { pathname: "/", search: "", hash: "" } as const;

function providerNodes() {
  return {
    google: document.querySelector(
      `script[src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`,
    ),
    ahrefs: document.querySelector(`script[data-key="${AHREFS_WEB_ANALYTICS_KEY}"]`),
  };
}

describe("analytics toolkit route provider isolation", () => {
  afterEach(() => {
    __resetAnalyticsConsentForTests();
    __resetGoogleAnalyticsLoaderForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    clearLocalStorageForTest();
    delete window[`ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`];
    document.head.querySelectorAll("script").forEach((node) => node.remove());
  });

  it("does not activate any provider on direct entry to the toolkit with saved consent", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    expect(readAnalyticsConsent()).toBe("granted");

    const reload = tearDownAnalyticsForExcludedRoute(readAnalyticsConsent(), TOOLKIT);

    expect(reload).toBe(false);
    expect(providerNodes()).toEqual({ google: null, ahrefs: null });
    expect(window[`ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`]).toBe(true);
  });

  it("does not activate any provider when navigation reaches the toolkit with saved consent", async () => {
    const { applyAnalyticsConsentDecision } = await import("@/lib/analyticsConsentRuntime");
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    applyAnalyticsConsentDecision("granted", LANDING);
    expect(providerNodes().google).not.toBeNull();
    expect(providerNodes().ahrefs).not.toBeNull();

    const googleBefore = providerNodes().google;
    const reload = tearDownAnalyticsForExcludedRoute(readAnalyticsConsent(), TOOLKIT);

    expect(providerNodes().google).toBe(googleBefore);
    expect(providerNodes().ahrefs).toBeNull();
    expect(window[`ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`]).toBe(true);
    expect(reload).toBe(true);
  });
});

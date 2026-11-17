// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://verdantgrowdiary.com/"}
// GA only collects on the production host (#2693), so these run there.
/**
 * #2714: the creator beta page tells visitors "No analytics." No provider may
 * load or send there, even when the visitor accepted analytics elsewhere.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  __resetAnalyticsConsentForTests,
  readAnalyticsConsent,
} from "@/lib/analyticsConsent";
import {
  applyAnalyticsConsentDecision,
  tearDownAnalyticsForExcludedRoute,
} from "@/lib/analyticsConsentRuntime";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { AHREFS_WEB_ANALYTICS_KEY, GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const GOOGLE_TAG = `script[src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`;
const AHREFS_TAG = `script[data-key="${AHREFS_WEB_ANALYTICS_KEY}"]`;
const GA_OPT_OUT = `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`;

const LANDING = { pathname: "/", search: "", hash: "" } as const;
const PRICING = { pathname: "/pricing", search: "", hash: "" } as const;
const CREATOR_BETA = { pathname: "/creator-beta", search: "", hash: "" } as const;

function at(pathname: string) {
  return { pathname, search: "", hash: "" };
}

function providerNodes() {
  return {
    google: document.querySelectorAll(GOOGLE_TAG).length,
    ahrefs: document.querySelectorAll(AHREFS_TAG).length,
  };
}

function gaOptedOut(): unknown {
  return (window as unknown as Record<string, unknown>)[GA_OPT_OUT];
}

describe("creator beta page analytics isolation", () => {
  afterEach(() => {
    __resetAnalyticsConsentForTests();
    __resetGoogleAnalyticsLoaderForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    clearLocalStorageForTest();
    delete (window as unknown as Record<string, unknown>)[GA_OPT_OUT];
    document.head.querySelectorAll("script").forEach((node) => node.remove());
  });

  it("activates no provider on direct entry with saved consent", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    expect(readAnalyticsConsent()).toBe("granted");

    for (const pathname of ["/creator-beta", "/creator-beta/", "/Creator-Beta", "//creator-beta"]) {
      expect(applyAnalyticsConsentDecision("granted", at(pathname)), pathname).toBe(false);
      expect(providerNodes(), pathname).toEqual({ google: 0, ahrefs: 0 });
      expect(gaOptedOut(), pathname).toBe(true);
    }
  });

  it("applies the same gate from the root route's excluded-route teardown", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");

    expect(tearDownAnalyticsForExcludedRoute(readAnalyticsConsent(), CREATOR_BETA)).toBe(false);

    expect(providerNodes()).toEqual({ google: 0, ahrefs: 0 });
    expect(gaOptedOut()).toBe(true);
  });

  it("stops running providers when navigation from the landing page reaches it", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    applyAnalyticsConsentDecision("granted", LANDING);
    expect(providerNodes()).toEqual({ google: 1, ahrefs: 1 });
    expect(gaOptedOut()).toBe(false);

    const reload = tearDownAnalyticsForExcludedRoute(readAnalyticsConsent(), CREATOR_BETA);

    // The Ahrefs tag already ran in this document, so the caller reloads it away.
    expect(reload).toBe(true);
    expect(providerNodes()).toEqual({ google: 1, ahrefs: 0 });
    expect(gaOptedOut()).toBe(true);
  });

  it("opts Google Analytics out without a reload when no Ahrefs tag ran", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    applyAnalyticsConsentDecision("granted", PRICING);
    expect(providerNodes()).toEqual({ google: 1, ahrefs: 0 });

    expect(tearDownAnalyticsForExcludedRoute(readAnalyticsConsent(), CREATOR_BETA)).toBe(false);

    expect(providerNodes()).toEqual({ google: 1, ahrefs: 0 });
    expect(gaOptedOut()).toBe(true);
  });

  it("turns measurement back on, once, after leaving for a normal page", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    applyAnalyticsConsentDecision("granted", CREATOR_BETA);
    expect(providerNodes()).toEqual({ google: 0, ahrefs: 0 });

    expect(applyAnalyticsConsentDecision("granted", PRICING)).toBe(false);

    expect(providerNodes()).toEqual({ google: 1, ahrefs: 0 });
    expect(gaOptedOut()).toBe(false);
  });

  it("keeps a declined visitor declined", () => {
    expect(applyAnalyticsConsentDecision("denied", CREATOR_BETA)).toBe(false);

    expect(providerNodes()).toEqual({ google: 0, ahrefs: 0 });
    expect(gaOptedOut()).toBe(true);
  });
});

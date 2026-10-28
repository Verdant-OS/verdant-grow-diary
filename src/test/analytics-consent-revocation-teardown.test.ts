import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AHREFS_WEB_ANALYTICS_SCRIPT_SRC,
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
} from "@/constants/analytics";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  __resetAnalyticsConsentForTests,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analyticsConsent";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

describe("analytics consent revocation teardown", () => {
  const landing = { pathname: "/", search: "", hash: "" };

  beforeEach(() => {
    document.head.innerHTML = "";
    clearLocalStorageForTest();
    __resetAnalyticsConsentForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
    delete (window as unknown as Record<string, unknown>)[
      `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    clearLocalStorageForTest();
    __resetAnalyticsConsentForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
  });

  it("stops loaded analytics on revoke without reloading when storage still says granted", () => {
    applyAnalyticsConsentDecision("granted", landing);
    expect(
      document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).not.toBeNull();

    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    writeAnalyticsConsent("denied");

    expect(getLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(readAnalyticsConsent()).toBe("denied");
    expect(applyAnalyticsConsentDecision("denied", landing)).toBe(false);
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>)[
        `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
      ],
    ).toBe(true);
    expect(
      document.querySelector(
        `script[src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`,
      ),
    ).not.toBeNull();
  });
});

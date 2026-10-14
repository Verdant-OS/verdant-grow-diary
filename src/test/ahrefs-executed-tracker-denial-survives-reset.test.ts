import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  __resetAnalyticsConsentForTests,
  readAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analyticsConsent";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import {
  __resetAhrefsAnalyticsLoaderForTests,
  loadAhrefsAnalytics,
} from "@/lib/ahrefsAnalyticsLoader";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

describe("executed Ahrefs tracker denial", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetAnalyticsConsentForTests();
    __resetGoogleAnalyticsLoaderForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    clearLocalStorageForTest();
    document.head.querySelectorAll("script").forEach((node) => node.remove());
  });

  it("stops an executed vendor beacon after a failed deny write and a failed tag removal", () => {
    const calls: string[] = [];
    navigator.sendBeacon = (url: string | URL) => {
      calls.push(String(url));
      return true;
    };
    loadAhrefsAnalytics();
    const vendor = () => {
      navigator.sendBeacon("https://analytics.ahrefs.com/collect", "");
    };
    window.addEventListener("click", vendor);
    window.dispatchEvent(new Event("click"));
    expect(calls).toHaveLength(1);

    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    writeAnalyticsConsent("denied");
    vi.spyOn(Element.prototype, "remove").mockImplementation(() => {
      throw new Error("removal blocked");
    });

    const reload = applyAnalyticsConsentDecision("denied", {
      pathname: "/",
      search: "",
      hash: "",
    });

    expect(reload).toBe(false);
    window.dispatchEvent(new Event("click"));
    expect(calls).toHaveLength(1);

    __resetAhrefsAnalyticsLoaderForTests();
    expect(readAnalyticsConsent()).toBe("denied");
    expect(getLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
    window.removeEventListener("click", vendor);
  });
});

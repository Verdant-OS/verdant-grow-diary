import { afterEach, describe, expect, it, vi } from "vitest";
import { AHREFS_WEB_ANALYTICS_SCRIPT_SRC } from "@/constants/analytics";
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

const LANDING = { pathname: "/", search: "", hash: "" } as const;

describe("analytics consent fresh document and re-consent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetAnalyticsConsentForTests();
    __resetGoogleAnalyticsLoaderForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    clearLocalStorageForTest();
    window.sessionStorage.clear();
    document.head.querySelectorAll("script").forEach((node) => node.remove());
  });

  it("lets a later grant deliver Ahrefs beacons after collection was stopped", () => {
    const calls: string[] = [];
    navigator.sendBeacon = (url: string | URL) => {
      calls.push(String(url));
      return true;
    };
    applyAnalyticsConsentDecision("granted", LANDING);
    applyAnalyticsConsentDecision("denied", LANDING);
    applyAnalyticsConsentDecision("granted", LANDING);

    navigator.sendBeacon("https://analytics.ahrefs.com/collect", "");
    expect(calls).toEqual(["https://analytics.ahrefs.com/collect"]);
    expect(
      document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).not.toBeNull();
  });

  it("keeps a failed denial after a fresh document rereads a stale saved grant", () => {
    const calls: string[] = [];
    const capturedBeacon = (url: string | URL, _data?: BodyInit | null) => {
      calls.push(String(url));
      return true;
    };
    navigator.sendBeacon = capturedBeacon;
    loadAhrefsAnalytics();
    const vendor = () => {
      capturedBeacon("https://analytics.ahrefs.com/collect", "");
    };
    window.addEventListener("click", vendor);

    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage) throw new Error("storage blocked");
      return originalSetItem.call(this, key, value);
    });
    writeAnalyticsConsent("denied");
    vi.restoreAllMocks();

    __resetAnalyticsConsentForTests();
    __resetAhrefsAnalyticsLoaderForTests();

    expect(getLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(readAnalyticsConsent()).toBe("denied");
    expect(applyAnalyticsConsentDecision(readAnalyticsConsent(), LANDING)).toBe(false);
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();

    window.dispatchEvent(new Event("click"));
    expect(calls.length).toBeGreaterThan(0);
    window.removeEventListener("click", vendor);
  });
});

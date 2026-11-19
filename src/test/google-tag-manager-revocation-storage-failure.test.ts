// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://verdantgrowdiary.com/"}
// Codex review finding on #3019 (P1): a revoke whose localStorage write fails
// must not leave a loaded Tag Manager container running silently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  __resetAnalyticsConsentForTests,
  readAnalyticsConsent,
  revocationSurvivesReload,
  writeAnalyticsConsent,
} from "@/lib/analyticsConsent";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { isGoogleTagManagerLoaded } from "@/lib/googleTagManagerLoader";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

type W = Window & { dataLayer?: unknown[]; gtag?: unknown };
const dashboard = { pathname: "/dashboard", search: "", hash: "" };
const quota = () => new DOMException("Quota exceeded", "QuotaExceededError");

function consentUpdates(): unknown[] {
  return ((window as W).dataLayer ?? []).filter((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const row = entry as ArrayLike<unknown>;
    return row[0] === "consent" && row[1] === "update";
  });
}

function reset(): void {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  clearLocalStorageForTest();
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
  __resetAnalyticsConsentForTests();
  __resetAhrefsAnalyticsLoaderForTests();
  __resetGoogleAnalyticsLoaderForTests();
  delete (window as W).dataLayer;
  delete (window as W).gtag;
}

/** Grant on /dashboard (GTM loads, Ahrefs does not), with the grant persisted. */
function grantAndLoadContainer(): void {
  setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
  expect(applyAnalyticsConsentDecision("granted", dashboard)).toBe(false);
  expect(isGoogleTagManagerLoaded()).toBe(true);
}

describe("google tag manager revocation when consent storage fails", () => {
  beforeEach(reset);
  afterEach(reset);

  it("reloads when only localStorage fails, because the session denial survives the reload", () => {
    grantAndLoadContainer();
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage) throw quota();
      return realSetItem.call(this, key, value);
    });

    writeAnalyticsConsent("denied");

    expect(readAnalyticsConsent()).toBe("denied");
    expect(window.sessionStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("denied");
    expect(revocationSurvivesReload()).toBe(true);
    expect(applyAnalyticsConsentDecision("denied", dashboard)).toBe(true);
    expect(consentUpdates()).toHaveLength(1);

    // A fresh document in this tab reads the session denial, so GTM stays off.
    __resetAnalyticsConsentForTests();
    expect(readAnalyticsConsent()).toBe("denied");
  });

  it("applies Google consent denial when no store can hold the revoke", () => {
    grantAndLoadContainer();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quota();
    });

    writeAnalyticsConsent("denied");

    expect(readAnalyticsConsent()).toBe("denied");
    expect(revocationSurvivesReload()).toBe(false);
    // A reload would reread the stale grant and load the container again.
    expect(applyAnalyticsConsentDecision("denied", dashboard)).toBe(false);
    const [update] = consentUpdates() as ArrayLike<unknown>[];
    expect(update?.[2]).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  });

  it("applies consent denial before the reload on an ordinary revoke", () => {
    grantAndLoadContainer();
    writeAnalyticsConsent("denied");
    expect(applyAnalyticsConsentDecision("denied", dashboard)).toBe(true);
    expect(consentUpdates()).toHaveLength(1);
  });

  it("pushes no consent update when no container ran", () => {
    expect(applyAnalyticsConsentDecision("denied", dashboard)).toBe(false);
    expect(consentUpdates()).toHaveLength(0);
  });
});

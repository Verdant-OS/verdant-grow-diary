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
  bindExecutedAhrefsTracker,
  loadAhrefsAnalytics,
} from "@/lib/ahrefsAnalyticsLoader";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";

const TRACK = "verdant:ahrefs-stub";

describe("executed Ahrefs tracker denial", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetAnalyticsConsentForTests();
    __resetGoogleAnalyticsLoaderForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    window.localStorage.clear();
    document.head.querySelectorAll("script").forEach((node) => node.remove());
  });

  it("keeps denial after a failed consent write and a failed tag removal, without reloading a stale grant", () => {
    let hits = 0;
    const listener = () => {
      hits += 1;
    };
    window.addEventListener(TRACK, listener);
    bindExecutedAhrefsTracker(() => window.removeEventListener(TRACK, listener));
    loadAhrefsAnalytics();
    window.dispatchEvent(new Event(TRACK));
    expect(hits).toBe(1);

    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
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
    window.dispatchEvent(new Event(TRACK));
    expect(hits).toBe(1);

    __resetAhrefsAnalyticsLoaderForTests();
    expect(readAnalyticsConsent()).toBe("denied");
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
    window.dispatchEvent(new Event(TRACK));
    expect(hits).toBe(1);
    window.removeEventListener(TRACK, listener);
  });
});

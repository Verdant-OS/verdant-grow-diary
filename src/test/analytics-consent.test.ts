import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  __resetAnalyticsConsentForTests,
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
  writeAnalyticsConsent,
} from "@/lib/analyticsConsent";

describe("analytics consent storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetAnalyticsConsentForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    __resetAnalyticsConsentForTests();
  });

  it("persists and publishes an explicit decision", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAnalyticsConsent(listener);

    writeAnalyticsConsent("granted");

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(readAnalyticsConsent()).toBe("granted");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps the decision for the current document when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    writeAnalyticsConsent("granted");

    expect(readAnalyticsConsent()).toBe("granted");
  });

  it("lets a later decision replace the in-memory fallback", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    writeAnalyticsConsent("granted");
    writeAnalyticsConsent("denied");

    expect(readAnalyticsConsent()).toBe("denied");
  });

  it("prefers a denied fallback when a failed write leaves granted storage readable", () => {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const decisionsSeenBySubscriber: string[] = [];
    const unsubscribe = subscribeToAnalyticsConsent(() => {
      decisionsSeenBySubscriber.push(readAnalyticsConsent());
    });

    writeAnalyticsConsent("denied");

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(readAnalyticsConsent()).toBe("denied");
    expect(decisionsSeenBySubscriber).toEqual(["denied"]);
    unsubscribe();
  });

  it("fails closed when a successfully persisted decision is removed", () => {
    writeAnalyticsConsent("granted");
    window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);

    expect(readAnalyticsConsent()).toBe("unset");
  });

  it("fails closed when a successfully persisted decision is corrupted", () => {
    writeAnalyticsConsent("granted");
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "not-a-decision");

    expect(readAnalyticsConsent()).toBe("unset");
  });
});

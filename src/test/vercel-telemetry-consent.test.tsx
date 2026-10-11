import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConsentGatedVercelAnalytics,
  ConsentGatedSpeedInsights,
} from "@/components/ConsentGatedVercelTelemetry";
import { ANALYTICS_CONSENT_STORAGE_KEY, writeAnalyticsConsent } from "@/lib/analyticsConsent";
import {
  ensureLocalStorageForTest,
  getLocalStorageMethodOwnerForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

type QueuedCommand = [string, ...unknown[]];
type TelemetryWindow = Window & {
  va?: (...args: unknown[]) => void;
  vaq?: QueuedCommand[];
  vam?: string;
  si?: (...args: unknown[]) => void;
  siq?: QueuedCommand[];
};
const telemetryWindow = window as TelemetryWindow;
const scriptSelector = 'script[src*="vercel-scripts.com"], script[src*="/_vercel/"]';

function BothTelemetryMounts() {
  return (
    <>
      <ConsentGatedVercelAnalytics />
      <ConsentGatedSpeedInsights />
    </>
  );
}

function scriptSources() {
  return [...document.head.querySelectorAll<HTMLScriptElement>(scriptSelector)].map(
    (script) => script.src,
  );
}

function registeredFilters() {
  return [telemetryWindow.vaq, telemetryWindow.siq].map((queue) => {
    const registration = queue
      ?.slice()
      .reverse()
      .find(([command]) => command === "beforeSend");
    expect(registration?.[1]).toBeTypeOf("function");
    return registration![1] as (event: unknown) => unknown;
  });
}

function expectBothScriptsOnce() {
  const sources = scriptSources();
  expect(sources).toHaveLength(2);
  expect(sources.filter((src) => src.includes("speed-insights"))).toHaveLength(1);
  expect(sources.filter((src) => !src.includes("speed-insights"))).toHaveLength(1);
}

function resetSdkState() {
  document.head.querySelectorAll(scriptSelector).forEach((script) => script.remove());
  delete telemetryWindow.va;
  delete telemetryWindow.vaq;
  delete telemetryWindow.vam;
  delete telemetryWindow.si;
  delete telemetryWindow.siq;
}

beforeEach(() => {
  removeLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY);
  resetSdkState();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetSdkState();
});

describe("Vercel telemetry uses the existing consent contract", () => {
  it.each([null, "denied", "unknown", "true"])(
    "does not initialize either real SDK when stored consent is %s",
    (value) => {
      if (value !== null) setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, value);
      render(<BothTelemetryMounts />);
      expect(scriptSources()).toEqual([]);
      expect(telemetryWindow.va).toBeUndefined();
      expect(telemetryWindow.si).toBeUndefined();
    },
  );

  it("fails closed when the initial storage read throws", () => {
    const storageOwner = getLocalStorageMethodOwnerForTest(ensureLocalStorageForTest(), "getItem");
    vi.spyOn(storageOwner, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<BothTelemetryMounts />);
    expect(scriptSources()).toEqual([]);
  });

  it("does not initialize telemetry during server rendering even with a stored grant", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    expect(renderToString(<BothTelemetryMounts />)).toBe("");
    expect(scriptSources()).toEqual([]);
    expect(telemetryWindow.va).toBeUndefined();
    expect(telemetryWindow.si).toBeUndefined();
  });

  it("loads each existing SDK once after hydrating a stored grant and on rerenders", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    const view = render(<BothTelemetryMounts />);
    expectBothScriptsOnce();
    view.rerender(<BothTelemetryMounts />);
    act(() => writeAnalyticsConsent("granted"));
    expectBothScriptsOnce();
    const event = { type: "pageview", url: "https://example.test/" };
    registeredFilters().forEach((filter) => expect(filter(event)).toBe(event));
  });

  it("waits for an explicit same-tab grant", () => {
    render(<BothTelemetryMounts />);
    expect(scriptSources()).toEqual([]);
    act(() => writeAnalyticsConsent("denied"));
    expect(scriptSources()).toEqual([]);
    act(() => writeAnalyticsConsent("granted"));
    expectBothScriptsOnce();
  });

  it("blocks callbacks retained by already-loaded SDKs immediately after revocation", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<BothTelemetryMounts />);
    const filters = registeredFilters();
    act(() => writeAnalyticsConsent("denied"));
    filters.forEach((filter) => expect(filter({ type: "pageview" })).toBeNull());
    act(() => writeAnalyticsConsent("granted"));
    expectBothScriptsOnce();
    const event = { type: "pageview" };
    filters.forEach((filter) => expect(filter(event)).toBe(event));
  });

  it("reacts to another tab's consent and rechecks the stored decision before sending", () => {
    render(<BothTelemetryMounts />);
    act(() => {
      setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
      window.dispatchEvent(new StorageEvent("storage", { key: ANALYTICS_CONSENT_STORAGE_KEY }));
    });
    expectBothScriptsOnce();
    const filters = registeredFilters();
    // The send guard must not wait for React or a storage notification.
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "denied");
    filters.forEach((filter) => expect(filter({ type: "event" })).toBeNull());
  });

  it("fails closed after storage is cleared", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<BothTelemetryMounts />);
    const filters = registeredFilters();
    act(() => {
      removeLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    filters.forEach((filter) => expect(filter({ type: "event" })).toBeNull());
  });

  it("fails closed if storage becomes unreadable after telemetry loaded", () => {
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    render(<BothTelemetryMounts />);
    const filters = registeredFilters();
    const storageOwner = getLocalStorageMethodOwnerForTest(ensureLocalStorageForTest(), "getItem");
    vi.spyOn(storageOwner, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    filters.forEach((filter) => expect(filter({ type: "event" })).toBeNull());
  });
});

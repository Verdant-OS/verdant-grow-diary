import { render, renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
} from "@/constants/analytics";
import { __resetAnalyticsConsentForTests, writeAnalyticsConsent } from "@/lib/analyticsConsent";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { trackFeedLogEvent } from "@/lib/athenaFeedLogAnalytics";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import {
  GOOGLE_ANALYTICS_COLLECTION_HOSTS,
  isGoogleAnalyticsCollectionHost,
} from "@/lib/googleAnalyticsHost";
import {
  __resetGoogleAnalyticsLoaderForTests,
  isGoogleAnalyticsLoaded,
  loadGoogleAnalytics,
} from "@/lib/googleAnalyticsLoader";
import { useGoogleAnalyticsPageViews } from "@/hooks/useGoogleAnalyticsPageViews";
import { PRICING_ANALYTICS_EVENT, trackPricingEvent } from "@/lib/pricingAnalytics";
import RootErrorBoundary from "@/components/RootErrorBoundary";

vi.mock("@/lib/react-router-compat", () => ({
  useLocation: () => ({ pathname: "/dashboard" }),
}));

const OPT_OUT_KEY = `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK}`;
const TAG_SELECTOR = `script[src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`;

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
};

function installHostname(hostname: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      hostname,
      host: hostname,
      origin: `https://${hostname}`,
      href: `https://${hostname}/`,
      protocol: "https:",
      pathname: "/",
      search: "",
      hash: "",
    },
  });
}

function dataLayerRows(): unknown[][] {
  const layer = (window as GtagWindow).dataLayer ?? [];
  return layer.map((entry) => Array.from(entry as ArrayLike<unknown>));
}

function Boom(): ReactNode {
  throw new Error("render boom");
}

describe("isGoogleAnalyticsCollectionHost", () => {
  it("allows only the two production hosts", () => {
    expect([...GOOGLE_ANALYTICS_COLLECTION_HOSTS]).toEqual([
      "verdantgrowdiary.com",
      "www.verdantgrowdiary.com",
    ]);
  });

  it.each([
    "verdantgrowdiary.com",
    "www.verdantgrowdiary.com",
    "VerdantGrowDiary.com",
    "WWW.VERDANTGROWDIARY.COM",
    " verdantgrowdiary.com. ",
  ])("accepts %s after normalization", (hostname) => {
    expect(isGoogleAnalyticsCollectionHost(hostname)).toBe(true);
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "[::1]",
    "::1",
    "x.workers.dev",
    "verdant-grow-diary1.cheekhimself.workers.dev",
    "verdantgrowdiary.lovable.app",
    "preview.pages.dev",
    "verdantgrowdiary.com.evil.test",
    "www.verdantgrowdiary.com.evil.test",
    "notverdantgrowdiary.com",
    "",
    "   ",
    ".",
  ])("rejects %s", (hostname) => {
    expect(isGoogleAnalyticsCollectionHost(hostname)).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isGoogleAnalyticsCollectionHost(null)).toBe(false);
    expect(isGoogleAnalyticsCollectionHost(undefined)).toBe(false);
  });
});

describe("GA4 host guard", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    __resetGoogleAnalyticsLoaderForTests();
    __resetAnalyticsConsentForTests();
    document.head.innerHTML = "";
    window.localStorage.clear();
    window.sessionStorage.clear();
    const w = window as GtagWindow;
    delete w.gtag;
    delete w.dataLayer;
    delete (window as unknown as Record<string, unknown>)[OPT_OUT_KEY];
  });

  afterEach(() => {
    __resetGoogleAnalyticsLoaderForTests();
    __resetAnalyticsConsentForTests();
    document.head.innerHTML = "";
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("does not load or define gtag on a disallowed host", () => {
    installHostname("127.0.0.1");
    loadGoogleAnalytics();

    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(0);
    expect(document.querySelectorAll('script[src*="googletagmanager.com"]')).toHaveLength(0);
    expect((window as GtagWindow).gtag).toBeUndefined();
    expect((window as GtagWindow).dataLayer).toBeUndefined();
    expect((window as unknown as Record<string, unknown>)[OPT_OUT_KEY]).toBe(true);
    expect(isGoogleAnalyticsLoaded()).toBe(false);
  });

  it.each([
    "localhost",
    "verdantgrowdiary.lovable.app",
    "verdant-grow-diary1.cheekhimself.workers.dev",
  ])("keeps the loader dark on %s", (hostname) => {
    installHostname(hostname);
    loadGoogleAnalytics();
    expect(document.querySelectorAll('script[src*="googletagmanager.com"]')).toHaveLength(0);
    expect((window as GtagWindow).gtag).toBeUndefined();
    expect((window as unknown as Record<string, unknown>)[OPT_OUT_KEY]).toBe(true);
  });

  it("loads once on the production host with send_page_view false", () => {
    installHostname("verdantgrowdiary.com");
    loadGoogleAnalytics();
    loadGoogleAnalytics();

    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(1);
    expect(typeof (window as GtagWindow).gtag).toBe("function");
    const config = dataLayerRows().find((row) => row[0] === "config");
    expect(config?.[1]).toBe(GOOGLE_ANALYTICS_MEASUREMENT_ID);
    expect(config?.[2]).toMatchObject({ send_page_view: false });
    expect(isGoogleAnalyticsLoaded()).toBe(true);
  });

  it("treats the uppercase production host as the collection host", () => {
    installHostname("WWW.VERDANTGROWDIARY.COM");
    loadGoogleAnalytics();
    expect(document.querySelectorAll('script[src*="googletagmanager.com"]')).toHaveLength(1);
  });

  it("does not collect from consent on a disallowed host, and opts out", () => {
    installHostname("localhost");
    const landing = { pathname: "/", search: "", hash: "" };

    expect(applyAnalyticsConsentDecision("unset", landing)).toBe(false);
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(0);

    applyAnalyticsConsentDecision("granted", landing);
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(0);
    expect((window as GtagWindow).gtag).toBeUndefined();
    expect((window as GtagWindow).dataLayer).toBeUndefined();
    expect((window as unknown as Record<string, unknown>)[OPT_OUT_KEY]).toBe(true);

    applyAnalyticsConsentDecision("denied", landing);
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(0);
    expect((window as unknown as Record<string, unknown>)[OPT_OUT_KEY]).toBe(true);
  });

  it("loads after granted consent on production and opts out on revoke", () => {
    installHostname("www.verdantgrowdiary.com");
    const landing = { pathname: "/", search: "", hash: "" };

    applyAnalyticsConsentDecision("unset", landing);
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(0);
    expect((window as GtagWindow).gtag).toBeUndefined();

    applyAnalyticsConsentDecision("granted", landing);
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(1);
    expect((window as unknown as Record<string, unknown>)[OPT_OUT_KEY]).toBe(false);

    applyAnalyticsConsentDecision("denied", landing);
    expect((window as unknown as Record<string, unknown>)[OPT_OUT_KEY]).toBe(true);
  });

  it("does not emit page_view, funnel, pricing, athena, or exception events off-host", () => {
    installHostname("127.0.0.1");
    writeAnalyticsConsent("granted");
    const gtag = vi.fn();
    (window as GtagWindow).gtag = gtag;
    const mirror = vi.fn();
    window.addEventListener(PRICING_ANALYTICS_EVENT, mirror);
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useGoogleAnalyticsPageViews());
    trackFunnelEvent("signup", { method: "email" });
    trackPricingEvent("pricing_interest_submitted", { plan: "pro_annual" });
    trackFeedLogEvent("feed_log_line_changed", { line: "blended" });
    render(createElement(RootErrorBoundary, null, createElement(Boom)));

    expect(gtag).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script[src*="googletagmanager.com"]')).toHaveLength(0);
    expect(mirror).toHaveBeenCalled();
    window.removeEventListener(PRICING_ANALYTICS_EVENT, mirror);
  });

  it("emits on the production host only after consent, and stops after revoke", () => {
    installHostname("verdantgrowdiary.com");
    document.title = "Diary";

    const { rerender } = renderHook(() => useGoogleAnalyticsPageViews());
    expect(dataLayerRows().some((row) => row[0] === "event" && row[1] === "page_view")).toBe(false);
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(0);

    act(() => {
      writeAnalyticsConsent("granted");
    });
    rerender();

    const views = dataLayerRows().filter((row) => row[0] === "event" && row[1] === "page_view");
    expect(views).toHaveLength(1);
    expect(views[0]?.[2]).toMatchObject({
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/dashboard",
      page_title: "Diary",
    });
    expect(document.querySelectorAll(TAG_SELECTOR)).toHaveLength(1);

    const gtag = (window as GtagWindow).gtag;
    expect(typeof gtag).toBe("function");
    trackFunnelEvent("signup", { method: "email" });
    trackPricingEvent("pricing_interest_submitted", { plan: "pro_annual" });
    trackFeedLogEvent("feed_log_cta_click", { cta_location: "tool" });
    const rows = dataLayerRows();
    expect(rows).toEqual(
      expect.arrayContaining([
        ["event", "signup", { method: "email" }],
        ["event", "pricing_interest_submitted", { plan: "pro_annual" }],
        ["event", "feed_log_cta_click", { cta_location: "tool" }],
      ]),
    );

    act(() => {
      writeAnalyticsConsent("denied");
    });
    rerender();
    expect(
      dataLayerRows().filter((row) => row[0] === "event" && row[1] === "page_view"),
    ).toHaveLength(1);

    vi.spyOn(console, "error").mockImplementation(() => {});
    render(createElement(RootErrorBoundary, null, createElement(Boom)));
    expect(dataLayerRows().some((row) => row[0] === "event" && row[1] === "exception")).toBe(true);
  });
});

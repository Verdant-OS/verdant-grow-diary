import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AHREFS_WEB_ANALYTICS_SCRIPT_SRC,
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
} from "@/constants/analytics";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";

describe("analytics consent runtime", () => {
  const landing = { pathname: "/", search: "", hash: "" };
  beforeEach(() => {
    document.head.innerHTML = "";
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
    delete (window as unknown as Record<string, unknown>)[
      `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
    ];
  });

  afterEach(() => {
    document.head.innerHTML = "";
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
  });

  it("loads both providers only after explicit granted consent", () => {
    expect(applyAnalyticsConsentDecision("unset", landing)).toBe(false);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);

    expect(applyAnalyticsConsentDecision("granted", landing)).toBe(false);

    expect(
      document.querySelector(
        `script[src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`,
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).not.toBeNull();
    expect(
      (window as unknown as Record<string, unknown>)[
        `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
      ],
    ).toBe(false);
  });

  it("opts Google out and removes the Ahrefs element after denial", () => {
    applyAnalyticsConsentDecision("granted", landing);
    expect(applyAnalyticsConsentDecision("denied", landing)).toBe(true);

    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>)[
        `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
      ],
    ).toBe(true);
  });

  it("never loads Ahrefs on a private route", () => {
    expect(
      applyAnalyticsConsentDecision("granted", {
        pathname: "/app/grows/private-id",
        search: "",
        hash: "",
      }),
    ).toBe(false);

    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });

  it("requires a document reload before leaving the allowlisted public landing", () => {
    applyAnalyticsConsentDecision("granted", landing);

    expect(
      applyAnalyticsConsentDecision("granted", { pathname: "/app", search: "", hash: "" }),
    ).toBe(true);
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });

  it.each([
    { pathname: "/", search: "?email=grower%40example.com", hash: "" },
    { pathname: "/", search: "", hash: "#private-value" },
  ])("never loads Ahrefs when the landing URL includes $search$hash", (location) => {
    expect(applyAnalyticsConsentDecision("granted", location)).toBe(false);
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });
});

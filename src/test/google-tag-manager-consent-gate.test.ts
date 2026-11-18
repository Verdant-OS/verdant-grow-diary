// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://verdantgrowdiary.com/"}
// GTM, like GA, only loads on the production diary host, so these run there.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GOOGLE_TAG_MANAGER_CONTAINER_ID } from "@/constants/analytics";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { isGoogleTagManagerLoaded, loadGoogleTagManager } from "@/lib/googleTagManagerLoader";
import {
  buildGoogleTagManagerScriptSrc,
  dataLayerHasGtagJsCommand,
  isValidGoogleTagManagerContainerId,
} from "@/lib/googleTagManagerRules";

const GTM_SRC = "https://www.googletagmanager.com/gtm.js?id=GTM-5SRRPGZT";
type W = Window & { dataLayer?: unknown[]; gtag?: unknown };

function gtmScripts(): HTMLScriptElement[] {
  return Array.from(document.scripts).filter((s) =>
    s.src.startsWith("https://www.googletagmanager.com/gtm.js"),
  );
}

function jsCommandCount(): number {
  return ((window as W).dataLayer ?? []).filter(
    (e) => e !== null && typeof e === "object" && (e as ArrayLike<unknown>)[0] === "js",
  ).length;
}

function reset(): void {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  __resetAhrefsAnalyticsLoaderForTests();
  __resetGoogleAnalyticsLoaderForTests();
  delete (window as W).dataLayer;
  delete (window as W).gtag;
}

describe("google tag manager rules", () => {
  it("pins the owner-supplied container id", () => {
    expect(GOOGLE_TAG_MANAGER_CONTAINER_ID).toBe("GTM-5SRRPGZT");
  });

  it("accepts only well-formed container ids", () => {
    expect(isValidGoogleTagManagerContainerId("GTM-5SRRPGZT")).toBe(true);
    for (const bad of [
      null,
      undefined,
      "",
      " GTM-5SRRPGZT",
      "gtm-5srrpgzt",
      "G-MCXQ9GVS5H",
      "GTM-",
      'GTM-5SRR"><x',
      42,
    ]) {
      expect(isValidGoogleTagManagerContainerId(bad)).toBe(false);
    }
  });

  it("builds Google's gtm.js URL and refuses malformed ids", () => {
    expect(buildGoogleTagManagerScriptSrc("GTM-5SRRPGZT")).toBe(GTM_SRC);
    expect(buildGoogleTagManagerScriptSrc("GTM-5SRR&x=1")).toBeNull();
    expect(buildGoogleTagManagerScriptSrc(undefined)).toBeNull();
  });

  it("detects an existing gtag js command in the shared dataLayer", () => {
    expect(dataLayerHasGtagJsCommand(undefined)).toBe(false);
    expect(dataLayerHasGtagJsCommand([])).toBe(false);
    expect(dataLayerHasGtagJsCommand([{ event: "x" }, ["config", "G-X"]])).toBe(false);
    expect(dataLayerHasGtagJsCommand([["js"]])).toBe(false);
    expect(dataLayerHasGtagJsCommand([["js", new Date(0)]])).toBe(true);
  });
});

describe("google tag manager loader", () => {
  beforeEach(reset);
  afterEach(reset);

  it("injects one async gtm.js script with Google's dataLayer bootstrap, idempotently", () => {
    expect(loadGoogleTagManager()).toBe(true);
    expect(loadGoogleTagManager()).toBe(true);
    const scripts = gtmScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(GTM_SRC);
    expect(scripts[0].async).toBe(true);
    expect(jsCommandCount()).toBe(1);
    const first = (window as W).dataLayer?.[0];
    expect(Array.isArray(first)).toBe(false); // Arguments object, as Google's snippet pushes
    expect((first as ArrayLike<unknown>)[1]).toBeInstanceOf(Date);
    expect(isGoogleTagManagerLoaded()).toBe(true);
  });

  it("never adds a noscript iframe, which would load without consent", () => {
    loadGoogleTagManager();
    expect(document.querySelector("noscript")).toBeNull();
    expect(document.querySelector('iframe[src*="googletagmanager.com/ns.html"]')).toBeNull();
  });

  it("refuses a malformed container id", () => {
    expect(loadGoogleTagManager("GTM-bad id")).toBe(false);
    expect(gtmScripts()).toHaveLength(0);
    expect((window as W).dataLayer).toBeUndefined();
  });
});

describe("google tag manager consent gate", () => {
  const landing = { pathname: "/", search: "", hash: "" };
  const dashboard = { pathname: "/dashboard", search: "", hash: "" };
  beforeEach(reset);
  afterEach(reset);

  it("loads nothing before an explicit grant", () => {
    applyAnalyticsConsentDecision("unset", dashboard);
    applyAnalyticsConsentDecision("denied", dashboard);
    expect(gtmScripts()).toHaveLength(0);
    expect(isGoogleTagManagerLoaded()).toBe(false);
  });

  it("loads the container after a grant without a second gtag js command", () => {
    expect(applyAnalyticsConsentDecision("granted", landing)).toBe(false);
    expect(gtmScripts()).toHaveLength(1);
    // GA4 already queued js; GTM must not queue another page-start event.
    expect(jsCommandCount()).toBe(1);
  });

  it("asks for a reload when consent is withdrawn after the container ran", () => {
    applyAnalyticsConsentDecision("granted", dashboard);
    expect(isGoogleTagManagerLoaded()).toBe(true);
    expect(applyAnalyticsConsentDecision("denied", dashboard)).toBe(true);
  });

  it("does not ask for a reload on a granted route change", () => {
    applyAnalyticsConsentDecision("granted", dashboard);
    expect(
      applyAnalyticsConsentDecision("granted", { pathname: "/grows", search: "", hash: "" }),
    ).toBe(false);
    expect(gtmScripts()).toHaveLength(1);
  });
});

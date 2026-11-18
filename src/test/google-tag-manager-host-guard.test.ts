// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://preview-abc.lovable.app/"}
import { afterEach, describe, expect, it } from "vitest";
import { applyAnalyticsConsentDecision } from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { isGoogleTagManagerLoaded, loadGoogleTagManager } from "@/lib/googleTagManagerLoader";

describe("google tag manager host guard", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    __resetGoogleAnalyticsLoaderForTests();
  });

  it("loads nothing off the production diary hosts, even with consent", () => {
    expect(loadGoogleTagManager()).toBe(false);
    applyAnalyticsConsentDecision("granted", { pathname: "/dashboard", search: "", hash: "" });
    expect(isGoogleTagManagerLoaded()).toBe(false);
    expect(document.querySelector('script[src*="googletagmanager.com/gtm.js"]')).toBeNull();
  });
});

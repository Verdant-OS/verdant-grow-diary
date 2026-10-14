import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AHREFS_WEB_ANALYTICS_SCRIPT_SRC } from "@/constants/analytics";
import { __resetAhrefsAnalyticsLoaderForTests } from "@/lib/ahrefsAnalyticsLoader";
import { __resetAnalyticsConsentForTests } from "@/lib/analyticsConsent";
import {
  applyAnalyticsConsentDecision,
  tearDownAnalyticsForExcludedRoute,
} from "@/lib/analyticsConsentRuntime";
import { __resetGoogleAnalyticsLoaderForTests } from "@/lib/googleAnalyticsLoader";
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";

describe("analytics route teardown", () => {
  const landing = { pathname: "/", search: "", hash: "" };
  const toolkit = { pathname: GROW_HELP_TOOLKIT_PATH, search: "", hash: "" };

  beforeEach(() => {
    document.head.innerHTML = "";
    __resetAnalyticsConsentForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
  });

  afterEach(() => {
    document.head.innerHTML = "";
    __resetAnalyticsConsentForTests();
    __resetAhrefsAnalyticsLoaderForTests();
    __resetGoogleAnalyticsLoaderForTests();
  });

  it("removes the landing loader when the toolkit route takes over and asks for a reload", () => {
    applyAnalyticsConsentDecision("granted", landing);
    expect(
      document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).not.toBeNull();

    expect(tearDownAnalyticsForExcludedRoute("granted", toolkit)).toBe(true);
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });

  it("leaves a non-toolkit route to the existing navigation gate", () => {
    applyAnalyticsConsentDecision("granted", landing);
    expect(
      tearDownAnalyticsForExcludedRoute("granted", { pathname: "/app", search: "", hash: "" }),
    ).toBe(false);
    expect(
      document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).not.toBeNull();
  });
});

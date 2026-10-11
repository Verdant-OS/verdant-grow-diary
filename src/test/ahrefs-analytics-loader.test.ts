import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AHREFS_WEB_ANALYTICS_KEY, AHREFS_WEB_ANALYTICS_SCRIPT_SRC } from "@/constants/analytics";
import {
  __resetAhrefsAnalyticsLoaderForTests,
  isAhrefsAnalyticsLoaded,
  loadAhrefsAnalytics,
  removeAhrefsAnalyticsScript,
} from "@/lib/ahrefsAnalyticsLoader";

describe("Ahrefs Web Analytics consent loader", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    __resetAhrefsAnalyticsLoaderForTests();
  });

  afterEach(() => {
    document.head.innerHTML = "";
    __resetAhrefsAnalyticsLoaderForTests();
  });

  it("resolves the owner-supplied public data key and official script URL", () => {
    expect(AHREFS_WEB_ANALYTICS_KEY).toBe("GRdwmweqUZoPO7SfmEsPZg");
    expect(AHREFS_WEB_ANALYTICS_SCRIPT_SRC).toBe("https://analytics.ahrefs.com/analytics.js");
  });

  it("injects one async script with the exact data-key attribute", () => {
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();

    loadAhrefsAnalytics();
    loadAhrefsAnalytics();

    const scripts = document.querySelectorAll<HTMLScriptElement>(
      `script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`,
    );
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute("data-key", AHREFS_WEB_ANALYTICS_KEY);
    expect(scripts[0]).toHaveAttribute("data-verdant-analytics-provider", "ahrefs");
    expect(scripts[0]?.async).toBe(true);
    expect(isAhrefsAnalyticsLoaded()).toBe(true);
  });

  it("removes the tag after consent is revoked and permits a later re-grant", () => {
    loadAhrefsAnalytics();
    removeAhrefsAnalyticsScript();
    expect(document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
    expect(isAhrefsAnalyticsLoaded()).toBe(false);

    loadAhrefsAnalytics();
    expect(
      document.querySelectorAll(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).toHaveLength(1);
  });

  it("uses the live DOM as its source of truth when a tag is removed externally", () => {
    loadAhrefsAnalytics();
    document.querySelector(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`)?.remove();

    expect(isAhrefsAnalyticsLoaded()).toBe(false);
    loadAhrefsAnalytics();

    expect(
      document.querySelectorAll(`script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`),
    ).toHaveLength(1);
    expect(isAhrefsAnalyticsLoaded()).toBe(true);
  });

  it("does not replace or duplicate an existing tag carrying another property key", () => {
    const existing = document.createElement("script");
    existing.src = AHREFS_WEB_ANALYTICS_SCRIPT_SRC;
    existing.dataset.key = "another-property";
    document.head.appendChild(existing);

    loadAhrefsAnalytics();

    const scripts = document.querySelectorAll<HTMLScriptElement>(
      `script[src="${AHREFS_WEB_ANALYTICS_SCRIPT_SRC}"]`,
    );
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute("data-key", "another-property");
    expect(isAhrefsAnalyticsLoaded()).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetGoogleAnalyticsLoaderForTests,
  isGoogleAnalyticsLoaded,
  loadGoogleAnalytics,
} from "@/lib/googleAnalyticsLoader";

describe("googleAnalyticsLoader — dataLayer queue shape", () => {
  beforeEach(() => {
    __resetGoogleAnalyticsLoaderForTests();
    // Fresh DOM stubs
    document.head.innerHTML = "";
    // @ts-expect-error test window cleanup
    delete window.dataLayer;
    // @ts-expect-error test window cleanup
    delete window.gtag;
  });

  afterEach(() => {
    __resetGoogleAnalyticsLoaderForTests();
    vi.restoreAllMocks();
  });

  it("pushes Arguments objects (not rest Arrays) so gtag.js can process the queue", () => {
    loadGoogleAnalytics("G-MCXQ9GVS5H");

    expect(isGoogleAnalyticsLoaded()).toBe(true);
    expect(typeof window.gtag).toBe("function");
    expect(Array.isArray(window.dataLayer)).toBe(true);

    const entries = window.dataLayer as unknown[];
    // js + config from bootstrap
    expect(entries.length).toBeGreaterThanOrEqual(2);

    for (const entry of entries) {
      // Must be Arguments-like, not a plain Array. gtag.js ignores Arrays.
      expect(Object.prototype.toString.call(entry)).toBe("[object Arguments]");
      expect(Array.isArray(entry)).toBe(false);
    }

    const config = entries.find((e) => {
      const a = e as IArguments;
      return a[0] === "config" && a[1] === "G-MCXQ9GVS5H";
    }) as IArguments;
    expect(config).toBeDefined();
    expect(config[2]).toMatchObject({ send_page_view: false });
  });

  it("is idempotent and injects the gtag.js script once", () => {
    loadGoogleAnalytics("G-MCXQ9GVS5H");
    loadGoogleAnalytics("G-MCXQ9GVS5H");
    const scripts = document.querySelectorAll(
      'script[src="https://www.googletagmanager.com/gtag/js?id=G-MCXQ9GVS5H"]',
    );
    expect(scripts).toHaveLength(1);
  });
});

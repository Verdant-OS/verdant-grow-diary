import { afterEach, describe, expect, it, vi } from "vitest";

import { trackFeedLogEvent } from "@/lib/cronkFeedLogAnalytics";

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    clear: () => {
      for (const key of Object.keys(data)) delete data[key];
    },
    key: () => null,
    length: 0,
  };
}

describe("cronk feed log analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fire without analytics consent and never sends page_view", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackFeedLogEvent("feed_log_line_changed", { line: "classic" });
    expect(gtag).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalledWith("event", "page_view", expect.anything());
  });

  it("forwards a granted line change with the line enum only", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage({ "verdant.analytics-consent.v1": "granted" }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackFeedLogEvent("feed_log_line_changed", { line: "puurorganics", weeks_filled: 1 });
    expect(gtag).toHaveBeenCalledWith("event", "feed_log_line_changed", {
      line: "puurorganics",
      weeks_filled: 1,
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/page_view|Product 1|notes/);
  });

  it("drops grower text that is not a known line", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage({ "verdant.analytics-consent.v1": "granted" }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackFeedLogEvent("feed_log_cta_click", {
      cta_location: "footer",
      line: "secret grow" as "classic",
    });
    expect(gtag).toHaveBeenCalledWith("event", "feed_log_cta_click", { cta_location: "footer" });
  });
});

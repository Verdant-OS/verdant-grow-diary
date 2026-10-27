import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeFeedLogAnalyticsParams, trackFeedLogEvent } from "@/lib/publicFeedLogAnalytics";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    },
    clear: () => {
      for (const key of Object.keys(values)) delete values[key];
    },
    key: () => null,
    length: 0,
  };
}

describe("public feed log analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops unknown fields and keeps numeric counters", () => {
    expect(
      sanitizeFeedLogAnalyticsParams({
        weeks_filled: 2,
        weeks_flagged: 1,
        product_count: 3,
        row_count: 12,
        cta_location: "tool",
      }),
    ).toEqual({
      weeks_filled: 2,
      weeks_flagged: 1,
      product_count: 3,
      row_count: 12,
      cta_location: "tool",
    });
    expect(
      sanitizeFeedLogAnalyticsParams({ cta_location: "secret" as "tool" }).cta_location,
    ).toBeUndefined();
  });

  it("stays silent until analytics consent is granted", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    const dispatch = vi.spyOn(window, "dispatchEvent");
    trackFeedLogEvent("feed_log_csv_exported", { row_count: 1 });
    expect(gtag).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
  });

  it("forwards a granted event to gtag and the app event", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage({ "verdant.analytics-consent.v1": "granted" }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    const dispatch = vi.spyOn(window, "dispatchEvent");
    trackFeedLogEvent("feed_log_copied", { row_count: 4 });
    expect(gtag).toHaveBeenCalledWith("event", "feed_log_copied", { row_count: 4 });
    expect(
      dispatch.mock.calls.some((call) => (call[0] as Event).type === "verdant:analytics"),
    ).toBe(true);
    dispatch.mockRestore();
  });
});

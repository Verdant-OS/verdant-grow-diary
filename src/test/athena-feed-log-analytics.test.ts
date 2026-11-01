// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://verdantgrowdiary.com/"}
// GA only collects on the production host (#2693), so these run there.
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackFeedLogEvent } from "@/lib/athenaFeedLogAnalytics";

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

describe("athena feed log analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fire without analytics consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackFeedLogEvent("feed_log_line_changed", { line: "blended" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("forwards a granted line change with the line enum only", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage({ "verdant.analytics-consent.v1": "granted" }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    const dispatch = vi.spyOn(window, "dispatchEvent");
    trackFeedLogEvent("feed_log_line_changed", {
      line: "pro_line",
      weeks_filled: 2,
    } as never);
    expect(gtag).toHaveBeenCalledWith("event", "feed_log_line_changed", {
      line: "pro_line",
      weeks_filled: 2,
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/Product|notes|ml\/gal/);
    expect(
      dispatch.mock.calls.some((call) => (call[0] as Event).type === "verdant:analytics"),
    ).toBe(true);
    dispatch.mockRestore();
  });

  it("drops a line value that is not pro_line or blended", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage({ "verdant.analytics-consent.v1": "granted" }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackFeedLogEvent("feed_log_cta_click", {
      cta_location: "tool",
      line: "secret grow" as "pro_line",
    });
    expect(gtag).toHaveBeenCalledWith("event", "feed_log_cta_click", { cta_location: "tool" });
  });
});

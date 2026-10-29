import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTOPOT_LOG_ANALYTICS_EVENTS, trackAutopotLogEvent } from "@/lib/autopotFeedLogAnalytics";

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

function grantConsent() {
  vi.stubGlobal("localStorage", memoryStorage({ "verdant.analytics-consent.v1": "granted" }));
  vi.stubGlobal("sessionStorage", memoryStorage());
}

describe("autopot feed log analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists exactly the eleven autopot_log events and no page_view", () => {
    expect(AUTOPOT_LOG_ANALYTICS_EVENTS).toHaveLength(11);
    expect(AUTOPOT_LOG_ANALYTICS_EVENTS.every((name) => name.startsWith("autopot_log_"))).toBe(
      true,
    );
    expect(AUTOPOT_LOG_ANALYTICS_EVENTS).not.toContain("page_view" as never);
  });

  it("does not fire without analytics consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackAutopotLogEvent("autopot_log_refill_added", { refill_count: 1 });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("forwards integers and enums only, never readings or grower text", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackAutopotLogEvent("autopot_log_refill_added", {
      refill_count: 3,
      mix: "Stash Bloom top dress",
      ec: 476,
    } as never);
    trackAutopotLogEvent("autopot_log_plan_compared", { compared_count: 1.5 });
    trackAutopotLogEvent("autopot_log_unit_selected", { unit: "ppm700" });
    trackAutopotLogEvent("autopot_log_unit_selected", { unit: "mS/cm" as "ms_cm" });
    trackAutopotLogEvent("autopot_log_system_selected", { system: "tray2grow" });
    trackAutopotLogEvent("autopot_log_source_click", { source: "stash" });
    trackAutopotLogEvent("autopot_log_cta_click", { cta_location: "footer" });
    expect(gtag.mock.calls.map((call) => call[2])).toEqual([
      { refill_count: 3 },
      {},
      { unit: "ppm700" },
      {},
      { system: "tray2grow" },
      { source: "stash" },
      { cta_location: "footer" },
    ]);
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/Stash Bloom|476/);
  });

  it("never loads gtag when it is missing", () => {
    grantConsent();
    Object.assign(window, { gtag: undefined });
    const appendChild = vi.spyOn(document.head, "appendChild");
    expect(() => trackAutopotLogEvent("autopot_log_print", {})).not.toThrow();
    expect(appendChild).not.toHaveBeenCalled();
    appendChild.mockRestore();
  });
});

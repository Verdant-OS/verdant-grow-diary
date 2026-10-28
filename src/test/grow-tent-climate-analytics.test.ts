import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLIMATE_TOOL_ANALYTICS_EVENTS,
  trackClimateToolEvent,
} from "@/lib/growTentClimateAnalytics";

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

describe("tent climate tool analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists exactly the nine climate_tool events and no page_view", () => {
    expect(CLIMATE_TOOL_ANALYTICS_EVENTS).toHaveLength(9);
    expect(CLIMATE_TOOL_ANALYTICS_EVENTS.every((name) => name.startsWith("climate_tool_"))).toBe(
      true,
    );
    expect(CLIMATE_TOOL_ANALYTICS_EVENTS).not.toContain("page_view" as never);
  });

  it("does not fire without analytics consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackClimateToolEvent("climate_tool_checked", { stage: "veg", status: "in_band" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("forwards counters and enums with consent and drops grower text", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackClimateToolEvent("climate_tool_reading_logged", {
      reading_count: 3,
      note: "after raising exhaust",
      airF: 77,
    } as never);
    trackClimateToolEvent("climate_tool_checked", { stage: "late_flower", status: "above" });
    expect(gtag).toHaveBeenNthCalledWith(1, "event", "climate_tool_reading_logged", {
      reading_count: 3,
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "climate_tool_checked", {
      stage: "late_flower",
      status: "above",
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/exhaust|77/);
  });

  it("keeps only known stage, status, problem and CTA enums", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackClimateToolEvent("climate_tool_checked", {
      stage: "seedling" as "veg",
      status: "great" as "above",
    });
    trackClimateToolEvent("climate_tool_fix_opened", { problem: "rh_low" });
    trackClimateToolEvent("climate_tool_fix_opened", { problem: "mold" as "rh_low" });
    trackClimateToolEvent("climate_tool_cta_click", { cta_location: "footer" });
    expect(gtag.mock.calls.map((call) => call[2])).toEqual([
      {},
      { problem: "rh_low" },
      {},
      { cta_location: "footer" },
    ]);
  });

  it("never loads gtag when it is missing", () => {
    grantConsent();
    Object.assign(window, { gtag: undefined });
    const appendChild = vi.spyOn(document.head, "appendChild");
    expect(() => trackClimateToolEvent("climate_tool_print", {})).not.toThrow();
    expect(appendChild).not.toHaveBeenCalled();
    appendChild.mockRestore();
  });
});

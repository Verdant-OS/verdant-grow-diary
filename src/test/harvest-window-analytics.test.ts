import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HARVEST_TRACKER_ANALYTICS_EVENTS,
  trackHarvestTrackerEvent,
} from "@/lib/harvestWindowAnalytics";

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

describe("harvest window tracker analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists exactly the ten harvest_tracker events and no page_view", () => {
    expect(HARVEST_TRACKER_ANALYTICS_EVENTS).toHaveLength(10);
    expect(
      HARVEST_TRACKER_ANALYTICS_EVENTS.every((name) => name.startsWith("harvest_tracker_")),
    ).toBe(true);
    expect(HARVEST_TRACKER_ANALYTICS_EVENTS).not.toContain("page_view" as never);
  });

  it("does not fire without analytics consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackHarvestTrackerEvent("harvest_tracker_target_changed", { target: "body" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("forwards counters with consent and drops grower text", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackHarvestTrackerEvent("harvest_tracker_check_added", {
      check_count: 3,
      plant_count: 2,
      plant: "Grandma's Kush",
      pistils: "orange",
    } as never);
    expect(gtag).toHaveBeenCalledWith("event", "harvest_tracker_check_added", {
      check_count: 3,
      plant_count: 2,
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/Kush|orange/);
  });

  it("keeps only known target and CTA enums", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackHarvestTrackerEvent("harvest_tracker_target_changed", { target: "secret" as "peak" });
    trackHarvestTrackerEvent("harvest_tracker_cta_click", { cta_location: "footer" });
    expect(gtag).toHaveBeenNthCalledWith(1, "event", "harvest_tracker_target_changed", {});
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "harvest_tracker_cta_click", {
      cta_location: "footer",
    });
  });

  it("never loads gtag when it is missing", () => {
    grantConsent();
    Object.assign(window, { gtag: undefined });
    const appendChild = vi.spyOn(document.head, "appendChild");
    expect(() => trackHarvestTrackerEvent("harvest_tracker_print", {})).not.toThrow();
    expect(appendChild).not.toHaveBeenCalled();
    appendChild.mockRestore();
  });
});

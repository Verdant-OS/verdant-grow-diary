import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTOFLOWER_PLANNER_ANALYTICS_EVENTS,
  trackAutoflowerPlannerEvent,
} from "@/lib/autoflowerWeekPlanAnalytics";

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

describe("autoflower planner analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the nine autoflower_planner events and no page_view", () => {
    expect(AUTOFLOWER_PLANNER_ANALYTICS_EVENTS).toHaveLength(9);
    expect(
      AUTOFLOWER_PLANNER_ANALYTICS_EVENTS.every((name) => name.startsWith("autoflower_planner_")),
    ).toBe(true);
  });

  it("does not fire without analytics consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackAutoflowerPlannerEvent("autoflower_planner_generated", { estimate_weeks: 10 });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("forwards counters and enums with consent and drops grower text", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackAutoflowerPlannerEvent("autoflower_planner_generated", {
      estimate_weeks: 9,
      light: "20_4",
      plant_name: "Grandma's Auto",
    } as never);
    expect(gtag).toHaveBeenCalledWith("event", "autoflower_planner_generated", {
      estimate_weeks: 9,
      light: "20_4",
    });
    trackAutoflowerPlannerEvent("autoflower_planner_cta_click", {
      cta_location: "nowhere" as "tool",
      light: "24/0" as "other",
    });
    expect(gtag).toHaveBeenLastCalledWith("event", "autoflower_planner_cta_click", {});
  });
});

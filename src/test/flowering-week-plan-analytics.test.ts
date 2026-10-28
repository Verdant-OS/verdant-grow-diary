import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOWERING_PLANNER_ANALYTICS_EVENTS,
  trackFloweringPlannerEvent,
} from "@/lib/floweringWeekPlanAnalytics";

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

describe("flowering planner analytics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists exactly the ten flowering_planner events and no page_view", () => {
    expect(FLOWERING_PLANNER_ANALYTICS_EVENTS).toHaveLength(10);
    expect(
      FLOWERING_PLANNER_ANALYTICS_EVENTS.every((name) => name.startsWith("flowering_planner_")),
    ).toBe(true);
    expect(FLOWERING_PLANNER_ANALYTICS_EVENTS).not.toContain("page_view" as never);
  });

  it("does not fire without analytics consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    Object.assign(window, { gtag });
    trackFloweringPlannerEvent("flowering_planner_generated", { flower_weeks: 9 });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("forwards integers and enums only, dropping grower text and non-integers", () => {
    const gtag = vi.fn();
    grantConsent();
    Object.assign(window, { gtag });
    trackFloweringPlannerEvent("flowering_planner_milestone_logged", {
      milestone_count: 2,
      note: "Gelato #33 tall pheno",
      plant: "Tent 1",
    } as never);
    trackFloweringPlannerEvent("flowering_planner_generated", { flower_weeks: 9.5 });
    trackFloweringPlannerEvent("flowering_planner_plant_type", { type: "autoflower" });
    trackFloweringPlannerEvent("flowering_planner_plant_type", { type: "clone" as "autoflower" });
    trackFloweringPlannerEvent("flowering_planner_cta_click", { cta_location: "footer" });
    expect(gtag.mock.calls.map((call) => call[2])).toEqual([
      { milestone_count: 2 },
      {},
      { type: "autoflower" },
      {},
      { cta_location: "footer" },
    ]);
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/Gelato|Tent 1/);
  });

  it("never loads gtag when it is missing", () => {
    grantConsent();
    Object.assign(window, { gtag: undefined });
    const appendChild = vi.spyOn(document.head, "appendChild");
    expect(() => trackFloweringPlannerEvent("flowering_planner_print", {})).not.toThrow();
    expect(appendChild).not.toHaveBeenCalled();
    appendChild.mockRestore();
  });
});

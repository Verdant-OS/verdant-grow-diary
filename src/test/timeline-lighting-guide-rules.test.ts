import { describe, expect, it } from "vitest";
import {
  resolveTimelineLightingGuide,
  TIMELINE_LIGHTING_GUIDE_LINKS,
} from "@/lib/timelineLightingGuideRules";

describe("resolveTimelineLightingGuide", () => {
  it("recognizes an explicit fixture or dose change as setup context", () => {
    const view = resolveTimelineLightingGuide({
      note: "Raised the grow light and changed the dimmer after mapping PPFD.",
      details: { photoperiod: "18/6", dli: 31.4 },
    });

    expect(view?.kind).toBe("setup");
    expect(view?.comparisons.map((item) => item.label)).toEqual([
      "Fixture",
      "Canopy dose",
      "Context",
      "Response",
    ]);
  });

  it.each(["light burn", "bleaching", "heat stress", "photobleaching", "hot spot"])(
    "recognizes %s as stress evidence to compare",
    (signal) => {
      const view = resolveTimelineLightingGuide({ note: `Checking possible ${signal}.` });
      expect(view?.kind).toBe("stress");
      expect(view?.comparisons.map((item) => item.label)).toEqual([
        "Possible excess light",
        "Bleaching",
        "Heat stress",
        "Look-alikes",
      ]);
    },
  );

  it("recognizes a plant-response symptom only when lighting context is explicit", () => {
    expect(
      resolveTimelineLightingGuide({
        note: "Top growth curling after the fixture was lowered.",
      })?.kind,
    ).toBe("stress");
    expect(resolveTimelineLightingGuide({ note: "Older leaf curling after watering." })).toBeNull();
  });

  it("reads structured diary detail keys without requiring visible prose", () => {
    const view = resolveTimelineLightingGuide({
      note: "",
      details: { light_distance_cm: 45, ppfd: { center: 620, source: "manual" } },
    });
    expect(view?.kind).toBe("setup");
  });

  it("ignores generic uses of light and invalid or empty input", () => {
    expect(resolveTimelineLightingGuide({ note: "Light watering today." })).toBeNull();
    expect(resolveTimelineLightingGuide({ note: "Highlight of the week." })).toBeNull();
    expect(resolveTimelineLightingGuide({ note: 72, details: null })).toBeNull();
    expect(resolveTimelineLightingGuide(null)).toBeNull();
  });

  it("always recommends both scoped guides and evidence to log next", () => {
    const view = resolveTimelineLightingGuide({ note: "Possible light stress." });
    expect(view?.links).toEqual(TIMELINE_LIGHTING_GUIDE_LINKS);
    expect(view?.logNext.length).toBeGreaterThanOrEqual(4);
    expect(view?.summary).toMatch(/not a diagnosis/i);
    expect(view?.summary).toMatch(/avoid changing lighting, feeding, watering, and airflow/i);
  });

  it("is deterministic and contains no automation or device-control promise", () => {
    const input = { note: "Bleaching under the grow light", details: { ppfd: 700 } };
    const first = resolveTimelineLightingGuide(input);
    expect(resolveTimelineLightingGuide(input)).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/automat|device control|will adjust|we'll change/i);
  });
});

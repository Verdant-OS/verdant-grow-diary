/**
 * Guards that breeding crossing-workflow event types render as their own
 * badge in /logs (via getEventType) rather than silently falling back to
 * "Observation", which would hide what the grower just logged.
 */
import { describe, it, expect } from "vitest";
import { getEventType } from "@/lib/diary";

describe("breeding event badges", () => {
  const cases: Array<[string, string]> = [
    ["reversal_application", "Reversal"],
    ["isolation_start", "Isolation"],
    ["pollination", "Pollination"],
    ["pollen_shed_observed", "Pollen shed"],
    ["stigmas_receptive", "Stigmas receptive"],
    ["cross_harvest", "Cross harvest"],
  ];

  it("maps each breeding event type to its own badge, not Observation", () => {
    for (const [value, label] of cases) {
      const def = getEventType(value);
      expect(def.value).toBe(value);
      expect(def.label).toBe(label);
      expect(def.label).not.toBe("Observation");
    }
  });
});

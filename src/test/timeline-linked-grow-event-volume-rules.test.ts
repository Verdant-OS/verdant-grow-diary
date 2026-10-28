/**
 * Copilot on #2267 at 4dcba2be (#2199 code, Timeline.tsx): the linked
 * grow_event volume was recovered only when the companion had no
 * watering/feeding envelope at all. A companion with `watering: { ph: 6.2 }`
 * hid the grow_event's 500 ml. Volume presence is checked on the nested
 * value, and the recovered volume merges into the existing envelope.
 */
import { describe, expect, it } from "vitest";
import {
  mergeLinkedGrowEventVolume,
  timelineDetailsHaveVolume,
} from "@/lib/timelineLinkedGrowEventVolumeRules";

describe("mergeLinkedGrowEventVolume", () => {
  it("recovers the grow_event volume into an envelope that has readings but no volume", () => {
    const details = { event_type: "watering", watering: { ph: 6.2 } };
    expect(mergeLinkedGrowEventVolume(details, "watering", 500)).toEqual({
      event_type: "watering",
      watering: { ph: 6.2, volume_ml: 500 },
    });
    // Input is not mutated.
    expect(details).toEqual({ event_type: "watering", watering: { ph: 6.2 } });
  });

  it("recovers a feeding volume into the feeding envelope", () => {
    expect(mergeLinkedGrowEventVolume({ feeding: { ec_in: 1.2 } }, "feeding", 750)).toEqual({
      feeding: { ec_in: 1.2, volume_ml: 750 },
    });
  });

  it("adds the envelope when the companion has none", () => {
    expect(mergeLinkedGrowEventVolume({}, "watering", 500)).toEqual({
      watering: { volume_ml: 500 },
    });
  });

  it("never overwrites a volume the companion already has", () => {
    for (const details of [
      { watering: { volume_ml: 300 } },
      { watering: { volumeMl: 300 } },
      { feeding: { volume_ml: 300 } },
      { watering_amount_ml: 300 },
      { wateringAmountMl: 300 },
      { volume_ml: 300 },
    ]) {
      expect(mergeLinkedGrowEventVolume(details, "watering", 500)).toBe(details);
    }
  });

  it("returns the same object for other types and invalid volumes", () => {
    const details = { watering: { ph: 6.2 } };
    expect(mergeLinkedGrowEventVolume(details, "observation", 500)).toBe(details);
    for (const vol of [null, undefined, "500", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(mergeLinkedGrowEventVolume(details, "watering", vol)).toBe(details);
    }
  });

  it("treats a non-object envelope as having no volume", () => {
    expect(timelineDetailsHaveVolume({ watering: "yes" })).toBe(false);
    expect(timelineDetailsHaveVolume({ watering: [500] })).toBe(false);
    expect(mergeLinkedGrowEventVolume({ watering: null }, "watering", 500)).toEqual({
      watering: { volume_ml: 500 },
    });
  });
});

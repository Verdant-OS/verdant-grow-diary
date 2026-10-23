/**
 * Supplemental regression coverage for #2385 / #2199 review fixes. Keeps
 * high-risk pure rules pinned without renegotiating scorer-locked files.
 */
import { describe, expect, it } from "vitest";
import { resolveAlertContextRefresh } from "@/lib/alertContextRefreshRules";
import {
  mergeLinkedGrowEventVolume,
  timelineDetailsHaveVolume,
} from "@/lib/timelineLinkedGrowEventVolumeRules";

describe("mergeLinkedGrowEventVolume empty envelopes (#2267 linked volume)", () => {
  it("merges into an existing watering or feeding envelope that has no volume field", () => {
    expect(mergeLinkedGrowEventVolume({ watering: {} }, "watering", 500)).toEqual({
      watering: { volume_ml: 500 },
    });
    expect(mergeLinkedGrowEventVolume({ feeding: {} }, "feeding", 750)).toEqual({
      feeding: { volume_ml: 750 },
    });
  });
});

describe("timelineDetailsHaveVolume", () => {
  it("treats envelope presence without a volume as no volume", () => {
    expect(timelineDetailsHaveVolume({ watering: {} })).toBe(false);
    expect(timelineDetailsHaveVolume({ feeding: { ec_in: 1.2 } })).toBe(false);
  });

  it("detects volume on flat and nested fields", () => {
    expect(timelineDetailsHaveVolume({ watering_amount_ml: 1 })).toBe(true);
    expect(timelineDetailsHaveVolume({ watering: { volume_ml: 1 } })).toBe(true);
    expect(timelineDetailsHaveVolume({ feeding: { volumeMl: 1 } })).toBe(true);
  });
});

describe("resolveAlertContextRefresh configured-range normalization", () => {
  it("does not refresh when only trailing punctuation differs on the same range", () => {
    const title = "Humidity above target";
    const rangeClause = (range: string) =>
      `Humidity is above the configured maximum (configured target ${range}).`;
    expect(
      resolveAlertContextRefresh(
        { title, reason: rangeClause("50–70.") },
        { title, reason: rangeClause("50–70") },
      ),
    ).toBeNull();
  });
});

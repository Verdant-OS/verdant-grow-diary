import { describe, expect, it } from "vitest";
import {
  FLOWER_WINDOW_MAX_DURATION_DAYS,
  FLOWER_WINDOW_PALETTE_KEY,
  FLOWER_WINDOW_SUGGESTED_DURATION_LABEL,
  deriveFlowerWindowCalendar,
} from "@/lib/flowerWindowCalendarRules";
import { calculatePlantRelativeDay } from "@/lib/relativeStageTimelineRules";

const PLANT_START = "2026-01-01T00:00:00.000Z";
const FLOWER_FLIP = "2026-03-02T00:00:00.000Z";
const NOW = "2026-03-12T12:00:00.000Z";

describe("deriveFlowerWindowCalendar", () => {
  it("derives plant day, flower day N of D, and a continuous UTC flower band", () => {
    const window = deriveFlowerWindowCalendar({
      plantStartedAt: PLANT_START,
      flowerFlipAt: FLOWER_FLIP,
      durationDays: 60,
      durationKind: "grower_set",
      now: NOW,
    });

    expect(window.plantDay).toBe(
      calculatePlantRelativeDay({ plantStartedAt: PLANT_START, eventAt: NOW }),
    );
    expect(window.flowerDay).toBe(10);
    expect(window.plantDayLabel).toBe("Plant day 70");
    expect(window.flowerDayLabel).toBe("Flower day 10 of 60");
    expect(window.durationHonestyLabel).toBeNull();
    expect(window.paletteKey).toBe(FLOWER_WINDOW_PALETTE_KEY);
    expect(window.bandDateKeys).toHaveLength(60);
    expect(window.bandDateKeys[0]).toBe("2026-03-02");
    expect(window.bandDateKeys[59]).toBe("2026-04-30");
    expect(window.honesty).toEqual({
      plantDayKnown: true,
      flowerDayKnown: true,
      durationSource: "grower_set",
      band: "derived",
      usedPlantStartAsFlowerAge: false,
    });
  });

  it("never uses plantStartedAt as flower age and never fakes Day 0", () => {
    const missing = deriveFlowerWindowCalendar({
      plantStartedAt: null,
      flowerFlipAt: null,
      durationDays: 60,
      now: NOW,
    });
    expect(missing.plantDay).toBeNull();
    expect(missing.flowerDay).toBeNull();
    expect(missing.plantDayLabel).toBeNull();
    expect(missing.flowerDayLabel).toBeNull();
    expect(missing.bandDateKeys).toEqual([]);
    expect(missing.honesty.usedPlantStartAsFlowerAge).toBe(false);

    const ages = deriveFlowerWindowCalendar({
      plantStartedAt: PLANT_START,
      flowerFlipAt: FLOWER_FLIP,
      durationDays: 60,
      now: NOW,
    });
    expect(ages.flowerDay).toBe(10);
    expect(ages.plantDay).toBe(70);
    expect(ages.flowerDay).not.toBe(ages.plantDay);
    expect(ages.honesty.usedPlantStartAsFlowerAge).toBe(false);
  });

  it("fails closed on invalid flip or duration and labels suggested duration", () => {
    expect(
      deriveFlowerWindowCalendar({
        plantStartedAt: PLANT_START,
        flowerFlipAt: "not-a-date",
        durationDays: 60,
        now: NOW,
      }).bandDateKeys,
    ).toEqual([]);
    expect(
      deriveFlowerWindowCalendar({
        plantStartedAt: PLANT_START,
        flowerFlipAt: FLOWER_FLIP,
        durationDays: 75,
        now: NOW,
      }).honesty.durationSource,
    ).toBe("grower_set");
    expect(
      deriveFlowerWindowCalendar({
        plantStartedAt: PLANT_START,
        flowerFlipAt: FLOWER_FLIP,
        durationDays: 0,
        now: NOW,
      }).honesty.band,
    ).toBe("null");
    expect(
      deriveFlowerWindowCalendar({
        plantStartedAt: PLANT_START,
        flowerFlipAt: FLOWER_FLIP,
        durationDays: 45.5,
        now: NOW,
      }).bandDateKeys,
    ).toEqual([]);

    const suggested = deriveFlowerWindowCalendar({
      plantStartedAt: PLANT_START,
      flowerFlipAt: FLOWER_FLIP,
      durationDays: 75,
      durationKind: "suggested",
      now: NOW,
    });
    expect(suggested.honesty.durationSource).toBe("suggested");
    expect(suggested.durationHonestyLabel).toBe(FLOWER_WINDOW_SUGGESTED_DURATION_LABEL);
    expect(suggested.flowerDayLabel).toBe("Flower day 10 of 75");
    expect(suggested.bandDateKeys).toHaveLength(75);
  });

  it("returns an empty window for null input", () => {
    const window = deriveFlowerWindowCalendar(null);
    expect(window.bandDateKeys).toEqual([]);
    expect(window.honesty.durationSource).toBe("missing");
    expect(window.honesty.band).toBe("null");
  });

  it("accepts a validated YYYY-MM-DD flower flip and builds an inclusive UTC band", () => {
    const window = deriveFlowerWindowCalendar({
      plantStartedAt: PLANT_START,
      flowerFlipAt: "2026-03-02",
      durationDays: 3,
      now: NOW,
    });

    expect(window.bandDateKeys).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
    expect(window.flowerDay).toBe(10);
    expect(window.honesty.band).toBe("derived");
  });

  it("rejects impossible calendar dates and durations above the safe integer cap", () => {
    expect(
      deriveFlowerWindowCalendar({
        plantStartedAt: PLANT_START,
        flowerFlipAt: "2026-02-30",
        durationDays: 60,
        now: NOW,
      }).bandDateKeys,
    ).toEqual([]);

    expect(
      deriveFlowerWindowCalendar({
        plantStartedAt: PLANT_START,
        flowerFlipAt: FLOWER_FLIP,
        durationDays: FLOWER_WINDOW_MAX_DURATION_DAYS + 1,
        now: NOW,
      }).honesty.band,
    ).toBe("null");
  });

  it("omits the flower day label when duration is missing even if flower age is known", () => {
    const window = deriveFlowerWindowCalendar({
      plantStartedAt: PLANT_START,
      flowerFlipAt: FLOWER_FLIP,
      durationDays: null,
      now: NOW,
    });

    expect(window.flowerDay).toBe(10);
    expect(window.flowerDayLabel).toBeNull();
    expect(window.bandDateKeys).toEqual([]);
    expect(window.honesty.durationSource).toBe("missing");
  });
});

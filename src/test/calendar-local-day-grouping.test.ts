/**
 * Diary and cultivation calendars group timestamped events by the viewer's
 * local calendar day.
 *
 * The whole file pins the process timezone to America/Chicago before the
 * calendar modules load, the same hoisted `process.env.TZ` pin as
 * `timeline-local-day-query-integration.test.tsx`. Date local getters
 * re-read that zone on each call in this runtime. The first test asserts
 * the pin actually took effect.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { buildCultivationCalendarMonthGrid } from "@/lib/cultivationCalendarMonthGridRules";
import { calendarStartDateDayKey } from "@/lib/calendarLocalDayRules";
import { buildDiaryCalendarViewModel, currentMonthKey } from "@/lib/diaryCalendarViewModel";
import { deriveFlowerWindowCalendar } from "@/lib/flowerWindowCalendarRules";
import {
  CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
  type CultivationCalendarProjectedReviewBlock,
} from "@/lib/cultivationCalendarProjectionRules";

const harness = vi.hoisted(() => {
  const originalTz = process.env.TZ;
  process.env.TZ = "America/Chicago";
  return { originalTz };
});

afterAll(() => {
  if (harness.originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = harness.originalTz;
});

/** 9:30 PM America/Chicago on 2026-10-08, stored as a UTC instant. */
const OCT_8_NINE_THIRTY_PM_CT = "2026-10-09T02:30:00.000Z";
/** 10:30 PM CDT on 2026-10-31. October is still CDT (UTC-5). */
const OCT_31_TEN_THIRTY_PM_CT = "2026-11-01T03:30:00.000Z";
/** 10:30 PM CDT on 2026-03-08, after that morning's spring-forward. */
const MAR_8_TEN_THIRTY_PM_CT = "2026-03-09T03:30:00.000Z";
/** 1:30 AM CDT on 2026-11-01, the first occurrence before fall-back. */
const NOV_1_FIRST_ONE_THIRTY_AM_CT = "2026-11-01T06:30:00.000Z";
/** 1:30 AM CST on 2026-11-01, the second occurrence after fall-back. */
const NOV_1_SECOND_ONE_THIRTY_AM_CT = "2026-11-01T07:30:00.000Z";
/** 10:30 PM CST on 2026-11-01, after fall-back (UTC-6). */
const NOV_1_TEN_THIRTY_PM_CT = "2026-11-02T04:30:00.000Z";

function watering(id: string, at: string) {
  return { id, entry_at: at, event_type: "watering" as const };
}

function review(id: string, scheduledAt: string): CultivationCalendarProjectedReviewBlock {
  return {
    id,
    category: "watering",
    scheduledAt,
    title: CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
    advisoryText: "Suggested review based on recent logs. Review watering readiness.",
    sourceFactCount: 3,
    cadenceMs: 86_400_000,
  };
}

function diaryDay(at: string): string {
  const groups = buildDiaryCalendarViewModel([watering("event", at)]);
  expect(groups).toHaveLength(1);
  return groups[0].dateKey;
}

function cultivationCellIds(monthKey: string, at: string, id: string) {
  const groups = buildDiaryCalendarViewModel([watering(id, at)]);
  const grid = buildCultivationCalendarMonthGrid({
    monthKey,
    loggedGroups: groups.map((group) => ({
      dateKey: group.dateKey,
      events: group.events.map((event) => ({
        id: event.id,
        kind: event.kind,
        label: event.label,
      })),
    })),
    projectedReviews: [review(`review-${id}`, at)],
  });
  return {
    logged: grid.days
      .filter((day) => day.loggedFacts.some((fact) => fact.id === id))
      .map((day) => day.dateKey),
    reviews: grid.days
      .filter((day) => day.advisoryReviews.some((block) => block.id === `review-${id}`))
      .map((day) => day.dateKey),
  };
}

describe("calendar local-day grouping (America/Chicago)", () => {
  it("pins the process timezone so local Date getters are America/Chicago", () => {
    expect(process.env.TZ).toBe("America/Chicago");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Chicago");
    expect(new Date(2026, 9, 8, 21, 30).toISOString()).toBe(OCT_8_NINE_THIRTY_PM_CT);
  });

  it("puts a 9:30 PM CT diary event on Oct 8 and keeps the stored UTC instant", () => {
    const groups = buildDiaryCalendarViewModel([watering("night", OCT_8_NINE_THIRTY_PM_CT)]);
    expect(groups.map((group) => group.dateKey)).toEqual(["2026-10-08"]);
    expect(groups[0].events[0].occurredAt).toBe(OCT_8_NINE_THIRTY_PM_CT);
    expect(cultivationCellIds("2026-10", OCT_8_NINE_THIRTY_PM_CT, "night")).toEqual({
      logged: ["2026-10-08"],
      reviews: ["2026-10-08"],
    });
  });

  it("does not shift a date-only plant or grow start date", () => {
    expect(calendarStartDateDayKey("2026-10-08")).toBe("2026-10-08");
    expect(calendarStartDateDayKey("2026-10-08T00:00:00.000Z")).toBe("2026-10-08");

    const dateOnly = deriveFlowerWindowCalendar({
      plantStartedAt: "2026-10-08",
      flowerFlipAt: "2026-10-08",
      durationDays: 2,
      durationKind: "grower_set",
      now: "2026-10-10T18:00:00.000Z",
    });
    expect(dateOnly.bandDateKeys).toEqual(["2026-10-08", "2026-10-09"]);

    const midnightSave = deriveFlowerWindowCalendar({
      plantStartedAt: "2026-10-08T00:00:00.000Z",
      flowerFlipAt: "2026-10-08T00:00:00.000Z",
      durationDays: 2,
      durationKind: "grower_set",
      now: "2026-10-10T18:00:00.000Z",
    });
    expect(midnightSave.bandDateKeys[0]).toBe("2026-10-08");

    const groups = buildDiaryCalendarViewModel([watering("bare-date", "2026-10-08")]);
    expect(groups.map((group) => group.dateKey)).toEqual(["2026-10-08"]);
  });

  it("keeps 10:30 PM CT on Oct 31 inside October", () => {
    expect(diaryDay(OCT_31_TEN_THIRTY_PM_CT)).toBe("2026-10-31");
    expect(currentMonthKey(new Date(OCT_31_TEN_THIRTY_PM_CT))).toBe("2026-10");
    expect(cultivationCellIds("2026-10", OCT_31_TEN_THIRTY_PM_CT, "month-end")).toEqual({
      logged: ["2026-10-31"],
      reviews: ["2026-10-31"],
    });
    expect(cultivationCellIds("2026-11", OCT_31_TEN_THIRTY_PM_CT, "month-end").logged).toEqual([]);
  });

  it("keeps spring-forward and fall-back evenings on the viewer's local day", () => {
    expect(diaryDay(MAR_8_TEN_THIRTY_PM_CT)).toBe("2026-03-08");
    expect(cultivationCellIds("2026-03", MAR_8_TEN_THIRTY_PM_CT, "spring").logged).toEqual([
      "2026-03-08",
    ]);

    expect(diaryDay(NOV_1_FIRST_ONE_THIRTY_AM_CT)).toBe("2026-11-01");
    expect(diaryDay(NOV_1_SECOND_ONE_THIRTY_AM_CT)).toBe("2026-11-01");
    expect(diaryDay(NOV_1_TEN_THIRTY_PM_CT)).toBe("2026-11-01");
    expect(cultivationCellIds("2026-11", NOV_1_TEN_THIRTY_PM_CT, "fall").logged).toEqual([
      "2026-11-01",
    ]);
    expect(cultivationCellIds("2026-11", NOV_1_TEN_THIRTY_PM_CT, "fall").reviews).toEqual([
      "2026-11-01",
    ]);
  });
});

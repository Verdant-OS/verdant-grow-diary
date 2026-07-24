import { describe, expect, it } from "vitest";
import {
  buildCultivationCalendarMonthGrid,
  type CultivationCalendarMonthGridInput,
  type CultivationCalendarMonthGridLoggedGroup,
} from "@/lib/cultivationCalendarMonthGridRules";
import {
  CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
  type CultivationCalendarProjectedReviewBlock,
} from "@/lib/cultivationCalendarProjectionRules";

function review(
  overrides: Partial<CultivationCalendarProjectedReviewBlock> = {},
): CultivationCalendarProjectedReviewBlock {
  return {
    id: "review-watering",
    category: "watering",
    scheduledAt: "2028-02-29T08:00:00.000Z",
    title: CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
    advisoryText: "Suggested review based on recent logs. Review watering readiness.",
    sourceFactCount: 3,
    cadenceMs: 86_400_000,
    ...overrides,
  };
}

function cellFor(input: CultivationCalendarMonthGridInput, dateKey: string) {
  const cell = buildCultivationCalendarMonthGrid(input).days.find((day) => day.dateKey === dateKey);
  expect(cell).toBeDefined();
  return cell!;
}

describe("buildCultivationCalendarMonthGrid", () => {
  it("creates a Sunday-first, six-week UTC grid across leap-year month boundaries", () => {
    const grid = buildCultivationCalendarMonthGrid({
      monthKey: "2028-02",
      loggedGroups: [],
      projectedReviews: [],
    });

    expect(grid).toMatchObject({ monthKey: "2028-02", isValidMonth: true });
    expect(grid.days).toHaveLength(42);
    expect(grid.days[0]).toMatchObject({
      dateKey: "2028-01-30",
      dayOfMonth: 30,
      isInMonth: false,
    });
    expect(grid.days[2]).toMatchObject({
      dateKey: "2028-02-01",
      dayOfMonth: 1,
      isInMonth: true,
    });
    expect(grid.days[30]).toMatchObject({
      dateKey: "2028-02-29",
      dayOfMonth: 29,
      isInMonth: true,
    });
    expect(grid.days[41]).toMatchObject({
      dateKey: "2028-03-11",
      dayOfMonth: 11,
      isInMonth: false,
    });
    expect(grid.days.filter((day) => day.isInMonth)).toHaveLength(29);
  });

  it("uses only the injected UTC today value and never a local or ambient clock", () => {
    const grid = buildCultivationCalendarMonthGrid({
      monthKey: "2028-02",
      loggedGroups: [],
      projectedReviews: [],
      today: "2028-03-01T01:30:00+02:00",
    });

    expect(grid.days.filter((day) => day.isToday).map((day) => day.dateKey)).toEqual([
      "2028-02-29",
    ]);
    expect(
      buildCultivationCalendarMonthGrid({
        monthKey: "2028-02",
        loggedGroups: [],
        projectedReviews: [],
      }).days.some((day) => day.isToday),
    ).toBe(false);
    expect(
      buildCultivationCalendarMonthGrid({
        monthKey: "2028-02",
        loggedGroups: [],
        projectedReviews: [],
        // A local-time string has no explicit UTC offset, so it is rejected.
        today: "2028-02-29T23:00:00",
      }).days.some((day) => day.isToday),
    ).toBe(false);
  });

  it("fails closed for malformed or impossible month keys", () => {
    for (const monthKey of [null, "", "2028-2", "2028-13", "2028-00", "2028-02-01"]) {
      expect(
        buildCultivationCalendarMonthGrid({
          monthKey,
          loggedGroups: [],
          projectedReviews: [],
        }),
      ).toEqual({ monthKey: null, isValidMonth: false, days: [] });
    }
  });

  it("places valid history and advisory reviews in separate, date-matched arrays", () => {
    const input: CultivationCalendarMonthGridInput = {
      monthKey: "2028-02",
      loggedGroups: [
        {
          dateKey: "2028-02-29",
          events: [{ id: "water-1", kind: "watering", label: "Watering logged" }],
        },
        {
          dateKey: "2028-02-30",
          events: [{ id: "impossible", kind: "feeding", label: "Ignored" }],
        },
        {
          dateKey: "2028-04-01",
          events: [{ id: "outside", kind: "feeding", label: "Ignored" }],
        },
      ],
      projectedReviews: [review()],
    };

    const leapDay = cellFor(input, "2028-02-29");
    expect(leapDay.loggedFacts).toEqual([
      { id: "water-1", kind: "watering", label: "Watering logged" },
    ]);
    expect(leapDay.advisoryReviews).toEqual([review()]);
    expect(leapDay).toMatchObject({ hasLoggedFacts: true, hasAdvisoryReviews: true });
    expect(leapDay.loggedFacts.some((fact) => fact.id === "review-watering")).toBe(false);
    expect(leapDay.advisoryReviews.some((item) => item.id === "water-1")).toBe(false);
  });

  it("sorts facts by calendar category then id, and advice by instant then category then id", () => {
    const loggedGroups: CultivationCalendarMonthGridLoggedGroup[] = [
      {
        dateKey: "2028-02-29",
        events: [
          { id: "w-2", kind: "watering", label: "Water two" },
          { id: "f-2", kind: "feeding", label: "Feed two" },
          { id: "f-1", kind: "feeding", label: "Feed one" },
          { id: "t-1", kind: "training", label: "Train" },
          { id: "z-1", kind: "zeta", label: "Other" },
        ],
      },
    ];
    const projectedReviews = [
      review({ id: "water-late", category: "watering", scheduledAt: "2028-02-29T12:00:00.000Z" }),
      review({ id: "water-early", category: "watering", scheduledAt: "2028-02-29T08:00:00.000Z" }),
      review({ id: "feed-early", category: "feeding", scheduledAt: "2028-02-29T08:00:00.000Z" }),
    ];

    const ordered = cellFor({ monthKey: "2028-02", loggedGroups, projectedReviews }, "2028-02-29");

    expect(ordered.loggedFacts.map((fact) => `${fact.kind}:${fact.id}`)).toEqual([
      "watering:w-2",
      "feeding:f-1",
      "feeding:f-2",
      "training:t-1",
      "zeta:z-1",
    ]);
    expect(ordered.advisoryReviews.map((item) => item.id)).toEqual([
      "feed-early",
      "water-early",
      "water-late",
    ]);
  });

  it("is deterministic, never mutates caller inputs, and ignores malformed runtime values", () => {
    const input: CultivationCalendarMonthGridInput = {
      monthKey: "2028-02",
      loggedGroups: [
        {
          dateKey: "2028-02-29",
          events: [{ id: "water-1", kind: "watering", label: "Watering logged" }],
        },
      ],
      projectedReviews: [review()],
      today: new Date("2028-02-29T12:00:00.000Z"),
    };
    const before = JSON.stringify(input);

    const once = buildCultivationCalendarMonthGrid(input);
    const twice = buildCultivationCalendarMonthGrid(input);
    expect(once).toEqual(twice);
    expect(JSON.stringify(input)).toBe(before);

    const malformed = buildCultivationCalendarMonthGrid({
      monthKey: "2028-02",
      loggedGroups: [
        {
          dateKey: "not-a-day",
          events: [{ id: "x", kind: "watering", label: "ignored" }],
        },
      ] as unknown as CultivationCalendarMonthGridLoggedGroup[],
      projectedReviews: [
        review({ title: "Scheduled action" as typeof CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE }),
      ],
    });
    expect(malformed.days.every((day) => !day.hasLoggedFacts && !day.hasAdvisoryReviews)).toBe(
      true,
    );
  });

  it("keeps grower-facing suggestion copy advisory rather than due or action language", () => {
    const cell = cellFor(
      {
        monthKey: "2028-02",
        loggedGroups: [],
        projectedReviews: [review()],
      },
      "2028-02-29",
    );
    const copy = cell.advisoryReviews
      .map((item) => `${item.title} ${item.advisoryText}`)
      .join(" ")
      .toLowerCase();

    expect(copy).toContain("suggested review based on recent logs");
    for (const prohibited of ["due", "action queue", "automatic", "device control", "must"]) {
      expect(copy).not.toContain(prohibited);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCultivationCalendarProjectedReviewBlocks,
  CULTIVATION_CALENDAR_STAGE_PALETTE,
  CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
  resolveCultivationCalendarStagePalette,
  type CultivationCalendarHistoryCategory,
  type CultivationCalendarHistoryFact,
} from "@/lib/cultivationCalendarProjectionRules";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-20T12:00:00.000Z");

function atDaysBeforeNow(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function fact(
  category: CultivationCalendarHistoryCategory,
  daysBeforeNow: number,
  id = `${category}-${daysBeforeNow}`,
): CultivationCalendarHistoryFact {
  return { category, occurredAt: atDaysBeforeNow(daysBeforeNow), id };
}

describe("buildCultivationCalendarProjectedReviewBlocks", () => {
  it("builds an advisory watering review from a consistent three-log cadence", () => {
    const blocks = buildCultivationCalendarProjectedReviewBlocks(
      [fact("watering", 12), fact("watering", 8), fact("watering", 4)],
      NOW,
    );

    expect(blocks).toEqual([
      expect.objectContaining({
        id: "history-review:watering:watering-4",
        category: "watering",
        scheduledAt: NOW.toISOString(),
        title: CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
        advisoryText: "Suggested review based on recent logs. Review watering readiness.",
        sourceFactCount: 3,
        cadenceMs: 4 * DAY_MS,
      }),
    ]);
  });

  it("supports every requested log category, including training, with a stable category order", () => {
    const categories: CultivationCalendarHistoryCategory[] = [
      "watering",
      "feeding",
      "training",
      "environment",
    ];
    const history = categories.flatMap((category) => [
      fact(category, 10),
      fact(category, 6),
      fact(category, 2),
    ]);

    const blocks = buildCultivationCalendarProjectedReviewBlocks(history, NOW);

    expect(blocks.map((block) => block.category)).toEqual([
      "environment",
      "feeding",
      "training",
      "watering",
    ]);
    expect(blocks.map((block) => block.advisoryText)).toEqual([
      "Suggested review based on recent logs. Review environmental conditions.",
      "Suggested review based on recent logs. Review feeding context.",
      "Suggested review based on recent logs. Review gentle training readiness.",
      "Suggested review based on recent logs. Review watering readiness.",
    ]);
  });

  it("requires three valid dated facts and rejects malformed, future, and duplicate category histories", () => {
    expect(
      buildCultivationCalendarProjectedReviewBlocks(
        [fact("watering", 8), fact("watering", 4)],
        NOW,
      ),
    ).toEqual([]);

    expect(
      buildCultivationCalendarProjectedReviewBlocks(
        [
          fact("feeding", 12),
          fact("feeding", 8),
          fact("feeding", 4),
          { category: "feeding", occurredAt: "not-a-date", id: "bad" },
        ],
        NOW,
      ),
    ).toEqual([]);

    expect(
      buildCultivationCalendarProjectedReviewBlocks(
        [
          fact("watering", 12),
          fact("watering", 8),
          fact("watering", 4),
          // No UTC marker or offset: fail closed instead of using the
          // browser's local timezone to infer a cadence.
          { category: "watering", occurredAt: "2026-07-16T08:00:00", id: "local-time" },
        ],
        NOW,
      ),
    ).toEqual([]);

    expect(
      buildCultivationCalendarProjectedReviewBlocks(
        [
          fact("training", 12),
          fact("training", 8),
          fact("training", 4),
          { category: "training", occurredAt: "2026-07-21T12:00:00.000Z", id: "future" },
        ],
        NOW,
      ),
    ).toEqual([]);

    expect(
      buildCultivationCalendarProjectedReviewBlocks(
        [
          fact("environment", 12),
          fact("environment", 8),
          fact("environment", 4),
          {
            category: "environment",
            occurredAt: "2026-07-16T07:00:00.000-05:00",
            id: "same-instant-different-offset",
          },
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("advances an elapsed cadence in whole intervals using only the injected UTC clock", () => {
    const clock = new Date("2026-01-12T00:00:00.000Z");
    const history: CultivationCalendarHistoryFact[] = [
      { category: "watering", occurredAt: "2026-01-01T00:00:00.000Z", id: "a" },
      { category: "watering", occurredAt: "2026-01-03T00:00:00.000Z", id: "b" },
      { category: "watering", occurredAt: "2026-01-05T00:00:00.000Z", id: "c" },
    ];

    const [block] = buildCultivationCalendarProjectedReviewBlocks(history, clock);

    expect(block.scheduledAt).toBe("2026-01-13T00:00:00.000Z");
    expect(block.cadenceMs).toBe(2 * DAY_MS);
  });

  it("is deterministic, orders blocks by time then category then id, and never mutates input", () => {
    const history: CultivationCalendarHistoryFact[] = [
      fact("watering", 8),
      fact("watering", 6),
      fact("watering", 4),
      fact("feeding", 10),
      fact("feeding", 6),
      fact("feeding", 2),
      fact("environment", 10),
      fact("environment", 6),
      fact("environment", 2),
      fact("training", 10),
      fact("training", 6),
      fact("training", 2),
    ];
    const before = JSON.stringify(history);

    const once = buildCultivationCalendarProjectedReviewBlocks(history, NOW);
    const twice = buildCultivationCalendarProjectedReviewBlocks(history, NOW);

    expect(once).toEqual(twice);
    expect(once.map((block) => `${block.scheduledAt}:${block.category}:${block.id}`)).toEqual([
      "2026-07-20T12:00:00.000Z:watering:history-review:watering:watering-4",
      "2026-07-22T12:00:00.000Z:environment:history-review:environment:environment-2",
      "2026-07-22T12:00:00.000Z:feeding:history-review:feeding:feeding-2",
      "2026-07-22T12:00:00.000Z:training:history-review:training:training-2",
    ]);
    expect(JSON.stringify(history)).toBe(before);
  });

  it("uses only calm advisory wording", () => {
    const blocks = buildCultivationCalendarProjectedReviewBlocks(
      [fact("watering", 12), fact("watering", 8), fact("watering", 4)],
      NOW,
    );
    const copy = blocks
      .map((block) => `${block.title} ${block.advisoryText}`)
      .join(" ")
      .toLowerCase();

    expect(copy).toContain("suggested review based on recent logs");
    expect(copy).toContain("review watering readiness");
    for (const prohibited of ["auto", "must", "due", "action queue", "device"]) {
      expect(copy).not.toContain(prohibited);
    }
  });
});

describe("cultivation calendar stage palette", () => {
  it("provides fixed labels and static color classes for all supported stages", () => {
    expect(CULTIVATION_CALENDAR_STAGE_PALETTE).toEqual({
      seedling: {
        stage: "seedling",
        label: "Seedling",
        blockClassName: "border border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
      },
      veg: {
        stage: "veg",
        label: "Vegetative",
        blockClassName: "border border-lime-400/40 bg-lime-500/15 text-lime-100",
      },
      flower: {
        stage: "flower",
        label: "Flowering",
        blockClassName: "border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100",
      },
      drying: {
        stage: "drying",
        label: "Drying / Curing",
        blockClassName: "border border-amber-400/40 bg-amber-500/15 text-amber-100",
      },
    });
  });

  it("resolves only known stages and fails closed for missing or unfamiliar values", () => {
    expect(resolveCultivationCalendarStagePalette("seedling")?.label).toBe("Seedling");
    expect(resolveCultivationCalendarStagePalette("veg")?.label).toBe("Vegetative");
    expect(resolveCultivationCalendarStagePalette("flower")?.label).toBe("Flowering");
    expect(resolveCultivationCalendarStagePalette("drying")?.label).toBe("Drying / Curing");
    expect(resolveCultivationCalendarStagePalette(null)).toBeNull();
    expect(resolveCultivationCalendarStagePalette(undefined)).toBeNull();
    expect(resolveCultivationCalendarStagePalette("vegetative")).toBeNull();
    expect(resolveCultivationCalendarStagePalette("mystery")).toBeNull();
  });
});

/**
 * The Timeline header shows the scoped plant's stage (then tent, then grow),
 * and counts days from the plant's start date when it has one. Regression: a
 * Flower plant in a grow and tent still marked Veg read "Vegetative · day 92".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTimelineHeaderStage } from "@/lib/timelineHeaderStageRules";

const previousTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Chicago";
});
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

// 2026-11-20 local noon in America/Chicago (set before each `new Date` below).
const now = () => new Date(2026, 10, 20, 12, 0, 0);
const vegGrow = { stage: "veg", started_at: "2026-08-01T15:00:00Z" };
const vegTent = { stage: "veg" };

describe("resolveTimelineHeaderStage", () => {
  it("uses a Flower plant's stage and start inside a Veg tent and grow", () => {
    expect(
      resolveTimelineHeaderStage(
        { plant: { stage: "flower", started_at: "2026-10-01" }, tent: vegTent, grow: vegGrow },
        now(),
      ),
    ).toEqual({
      stage: "flower",
      stageSource: "plant",
      startedAt: "2026-10-01",
      startedAtSource: "plant",
      day: 50,
    });
  });

  it("reads a UTC-midnight plant start as the picked calendar date", () => {
    const header = resolveTimelineHeaderStage(
      {
        plant: { stage: "flower", started_at: "2026-10-01T00:00:00.000Z" },
        tent: vegTent,
        grow: vegGrow,
      },
      now(),
    );
    expect(header.day).toBe(50);
    expect(header.startedAtSource).toBe("plant");
  });

  it("falls through a blank plant stage to the tent, then a blank tent to the grow", () => {
    const tentWins = resolveTimelineHeaderStage(
      { plant: { stage: "   ", started_at: null }, tent: { stage: "flower" }, grow: vegGrow },
      now(),
    );
    expect(tentWins.stage).toBe("flower");
    expect(tentWins.stageSource).toBe("tent");

    const growWins = resolveTimelineHeaderStage(
      { plant: { stage: "" }, tent: { stage: "  " }, grow: vegGrow },
      now(),
    );
    expect(growWins.stage).toBe("veg");
    expect(growWins.stageSource).toBe("grow");
  });

  it("counts days from the grow start when the plant has no start", () => {
    const header = resolveTimelineHeaderStage(
      { plant: { stage: "flower", started_at: "  " }, grow: vegGrow },
      now(),
    );
    expect(header).toEqual({
      stage: "flower",
      stageSource: "plant",
      startedAt: "2026-08-01T15:00:00Z",
      startedAtSource: "grow",
      day: 111,
    });
  });

  it("keeps the grow-only header unchanged", () => {
    expect(resolveTimelineHeaderStage({ grow: vegGrow }, now())).toEqual({
      stage: "veg",
      stageSource: "grow",
      startedAt: "2026-08-01T15:00:00Z",
      startedAtSource: "grow",
      day: 111,
    });
  });

  it("returns no stage and no day when every record is missing", () => {
    const empty = {
      stage: null,
      stageSource: "none",
      startedAt: null,
      startedAtSource: "none",
      day: null,
    };
    expect(resolveTimelineHeaderStage({}, now())).toEqual(empty);
    expect(resolveTimelineHeaderStage({ plant: null, tent: null, grow: null }, now())).toEqual(
      empty,
    );
  });

  it("shows no day for a future or unreadable plant start instead of borrowing the grow's", () => {
    for (const started_at of ["2026-12-01", "not-a-date", "2026-02-30"]) {
      const header = resolveTimelineHeaderStage(
        { plant: { stage: "flower", started_at }, grow: vegGrow },
        now(),
      );
      expect(header.day).toBeNull();
      expect(header.startedAtSource).toBe("plant");
    }
  });

  it("counts a plant started today as day 0", () => {
    expect(
      resolveTimelineHeaderStage({ plant: { stage: "flower", started_at: "2026-11-20" } }, now())
        .day,
    ).toBe(0);
  });
});

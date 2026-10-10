/**
 * Quick Log timeline clocks follow the viewer's local timezone.
 *
 * A note at 9:30 PM America/Chicago on Oct 8 2026 is stored as
 * 2026-10-09T02:30:00.000Z. Display and day grouping must stay on Oct 8.
 * Stored ISO values are not rewritten.
 *
 * Timezone-sensitive cases set `process.env.TZ` around the call, the same
 * pattern as timeline-date-range-rules.test.ts. The numeric Date API
 * re-reads that zone on each call. The first assertion in the Chicago
 * case proves the assignment took effect: local 9:30 PM round-trips to
 * the stored UTC instant.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  entryMatchesQuickLogGroupedTimelineFilter,
  formatQuickLogOccurredAt,
  groupByQuickLogLocalDay,
  quickLogLocalDayKey,
} from "@/lib/quickLogGroupedTimelineFilterViewModel";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

const STORED_OCT_8_NINE_THIRTY_PM_CT = "2026-10-09T02:30:00.000Z";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function withTimeZone<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

function noteAt(iso: string): QuickLogTimelineEntry {
  return {
    kind: "action",
    occurredAt: iso,
    actionSourceLabel: "Manual",
    action: {
      id: "note-oct8",
      kind: "note",
      source: "manual",
      plantId: "p1",
      tentId: "t1",
      occurredAt: iso,
      noteText: "Lights out.",
    },
  };
}

describe("Quick Log timeline local timezone — America/Chicago", () => {
  it("proves TZ=America/Chicago is active, then shows and groups Oct 8 9:30 PM", () => {
    withTimeZone("America/Chicago", () => {
      expect(new Date(2026, 9, 8, 21, 30, 0, 0).toISOString()).toBe(STORED_OCT_8_NINE_THIRTY_PM_CT);
      expect(formatQuickLogOccurredAt(STORED_OCT_8_NINE_THIRTY_PM_CT)).toBe("Oct 8, 2026, 9:30 PM");
      const groups = groupByQuickLogLocalDay(
        [noteAt(STORED_OCT_8_NINE_THIRTY_PM_CT)],
        (entry) => entry.occurredAt,
        { now: new Date(2026, 9, 20, 12, 0, 0, 0) },
      );
      expect(groups).toEqual([
        {
          dayKey: "2026-10-08",
          label: "Thu, Oct 8",
          items: [noteAt(STORED_OCT_8_NINE_THIRTY_PM_CT)],
        },
      ]);
      expect(quickLogLocalDayKey(STORED_OCT_8_NINE_THIRTY_PM_CT)).toBe("2026-10-08");
    });
  });

  it("the same stored instant is Oct 9 in UTC, so the Chicago result is not a UTC label", () => {
    withTimeZone("UTC", () => {
      expect(formatQuickLogOccurredAt(STORED_OCT_8_NINE_THIRTY_PM_CT)).toBe("Oct 9, 2026, 2:30 AM");
      expect(quickLogLocalDayKey(STORED_OCT_8_NINE_THIRTY_PM_CT)).toBe("2026-10-09");
    });
  });

  it("keeps a local-evening note in its type filter; filters do not bucket by UTC day", () => {
    withTimeZone("America/Chicago", () => {
      const entry = noteAt(STORED_OCT_8_NINE_THIRTY_PM_CT);
      expect(entryMatchesQuickLogGroupedTimelineFilter(entry, "note")).toBe(true);
      expect(entry.occurredAt).toBe(STORED_OCT_8_NINE_THIRTY_PM_CT);
    });
  });

  it("labels Today and Yesterday from the viewer's local calendar", () => {
    withTimeZone("America/Chicago", () => {
      const today = noteAt("2026-10-09T02:30:00.000Z");
      const yesterday = noteAt("2026-10-08T03:00:00.000Z");
      const groups = groupByQuickLogLocalDay([today, yesterday], (entry) => entry.occurredAt, {
        now: new Date(2026, 9, 8, 22, 0, 0, 0),
      });
      expect(groups.map((group) => ({ dayKey: group.dayKey, label: group.label }))).toEqual([
        { dayKey: "2026-10-08", label: "Today" },
        { dayKey: "2026-10-07", label: "Yesterday" },
      ]);
    });
  });

  it("passes invalid timestamps through and does not invent a clock", () => {
    withTimeZone("America/Chicago", () => {
      expect(formatQuickLogOccurredAt("not-a-date")).toBe("not-a-date");
      expect(formatQuickLogOccurredAt("")).toBe("");
      expect(formatQuickLogOccurredAt(null)).toBe("");
      expect(formatQuickLogOccurredAt(undefined)).toBe("");
      expect(quickLogLocalDayKey("not-a-date")).toBeNull();
      expect(quickLogLocalDayKey(null)).toBeNull();
    });
  });
});

describe("Quick Log timeline local timezone — America/Chicago DST", () => {
  it("groups both fall-back 1:30 AM instants on Nov 1 2026", () => {
    withTimeZone("America/Chicago", () => {
      const firstOneThirtyCdt = "2026-11-01T06:30:00.000Z";
      const secondOneThirtyCst = "2026-11-01T07:30:00.000Z";
      expect(formatQuickLogOccurredAt(firstOneThirtyCdt)).toBe("Nov 1, 2026, 1:30 AM");
      expect(formatQuickLogOccurredAt(secondOneThirtyCst)).toBe("Nov 1, 2026, 1:30 AM");
      const groups = groupByQuickLogLocalDay(
        [noteAt(firstOneThirtyCdt), noteAt(secondOneThirtyCst)],
        (entry) => entry.occurredAt,
        { now: new Date(2026, 10, 15, 12, 0, 0, 0) },
      );
      expect(groups).toHaveLength(1);
      expect(groups[0]?.dayKey).toBe("2026-11-01");
      expect(groups[0]?.label).toBe("Sun, Nov 1");
      expect(groups[0]?.items).toHaveLength(2);
    });
  });

  it("keeps the spring-forward gap on Mar 8 2026 and does not invent 2:30 AM", () => {
    withTimeZone("America/Chicago", () => {
      const oneThirtyBeforeGap = "2026-03-08T07:30:00.000Z";
      const threeThirtyAfterGap = "2026-03-08T08:30:00.000Z";
      expect(formatQuickLogOccurredAt(oneThirtyBeforeGap)).toBe("Mar 8, 2026, 1:30 AM");
      expect(formatQuickLogOccurredAt(threeThirtyAfterGap)).toBe("Mar 8, 2026, 3:30 AM");
      expect(quickLogLocalDayKey(oneThirtyBeforeGap)).toBe("2026-03-08");
      expect(quickLogLocalDayKey(threeThirtyAfterGap)).toBe("2026-03-08");
      expect(formatQuickLogOccurredAt(oneThirtyBeforeGap)).not.toContain("2:30");
      expect(formatQuickLogOccurredAt(threeThirtyAfterGap)).not.toContain("2:30");
    });
  });
});

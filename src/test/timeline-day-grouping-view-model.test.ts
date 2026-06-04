/**
 * timelineDayGroupingViewModel — test
 */
import { describe, it, expect } from "vitest";
import {
  buildTimelineDayGroups,
  type BuildTimelineDayGroupsOptions,
  type TimelineDayGroup,
} from "@/lib/timelineDayGroupingViewModel";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

function makeDiaryItem(opts: {
  key: string;
  occurredAt: string;
  eventType?: string | null;
}): TimelineMemoryItem {
  return {
    kind: "diary",
    key: opts.key,
    occurredAt: opts.occurredAt,
    eventType: opts.eventType ?? null,
    hasPhoto: false,
    note: null,
  };
}

function makeSnapshotItem(opts: {
  key: string;
  occurredAt: string;
}): TimelineMemoryItem {
  return {
    kind: "manual_sensor_snapshot",
    key: opts.key,
    occurredAt: opts.occurredAt,
    card: {
      id: opts.key,
      title: "Manual sensor snapshot",
      capturedAt: opts.occurredAt,
      sourceLabel: "Manual",
      source: "manual",
      tentId: "tent-1",
      plantId: null,
      isTentLevel: true,
      notes: null,
      readings: [],
      severity: "ok",
      warnings: [],
      errors: [],
    },
  };
}

const TZ_OFFSET_MS = new Date().getTimezoneOffset() * 60_000;

function localIso(y: number, m: number, d: number, h = 0, min = 0): string {
  const date = new Date(Date.UTC(y, m - 1, d, h, min) + TZ_OFFSET_MS);
  return date.toISOString();
}

describe("buildTimelineDayGroups", () => {
  it("groups entries by local calendar day", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 1, 10) }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 1, 14) }),
      makeDiaryItem({ key: "c", occurredAt: localIso(2026, 6, 2, 9) }),
    ];

    const groups = buildTimelineDayGroups(items, {
      now: new Date(Date.UTC(2026, 6, 3, 0, 0) + TZ_OFFSET_MS),
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].dayKey).toBe("2026-06-02");
    expect(groups[0].count).toBe(1);
    expect(groups[0].items.map((i) => i.key)).toEqual(["c"]);

    expect(groups[1].dayKey).toBe("2026-06-01");
    expect(groups[1].count).toBe(2);
    expect(groups[1].items.map((i) => i.key)).toEqual(["a", "b"]);
  });

  it("shows Today label when day matches clock", () => {
    const now = new Date(Date.UTC(2026, 6, 3, 12, 0) + TZ_OFFSET_MS);
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 3, 10) }),
    ];
    const groups = buildTimelineDayGroups(items, { now });
    expect(groups[0].label).toBe("Today");
  });

  it("shows Yesterday label when day is one before clock", () => {
    const now = new Date(Date.UTC(2026, 6, 3, 12, 0) + TZ_OFFSET_MS);
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 2, 10) }),
    ];
    const groups = buildTimelineDayGroups(items, { now });
    expect(groups[0].label).toBe("Yesterday");
  });

  it("shows formatted date for older events", () => {
    const now = new Date(Date.UTC(2026, 6, 5, 12, 0) + TZ_OFFSET_MS);
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 1, 10) }),
    ];
    const groups = buildTimelineDayGroups(items, { now });
    expect(groups[0].label).toMatch(/Jun/);
  });

  it("preserves event order inside groups", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 1, 14) }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 1, 10) }),
      makeDiaryItem({ key: "c", occurredAt: localIso(2026, 6, 1, 16) }),
    ];
    const groups = buildTimelineDayGroups(items);
    expect(groups[0].items.map((i) => i.key)).toEqual(["a", "b", "c"]);
  });

  it("filters still apply before grouping (caller responsibility)", () => {
    // View-model itself doesn't filter, but it should handle any subset.
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 1, 10) }),
    ];
    const groups = buildTimelineDayGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });

  it("handles empty array", () => {
    const groups = buildTimelineDayGroups([]);
    expect(groups).toHaveLength(0);
  });

  it("drops undated items silently", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: "invalid-date" }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 1, 10) }),
    ];
    const groups = buildTimelineDayGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.key)).toEqual(["b"]);
  });

  it("supports injectable clock as function", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 3, 10) }),
    ];
    const groups = buildTimelineDayGroups(items, {
      now: () => new Date(Date.UTC(2026, 6, 3, 12, 0) + TZ_OFFSET_MS),
    });
    expect(groups[0].label).toBe("Today");
  });

  it("supports injectable clock as number", () => {
    const nowMs = new Date(Date.UTC(2026, 6, 3, 12, 0) + TZ_OFFSET_MS).getTime();
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 3, 10) }),
    ];
    const groups = buildTimelineDayGroups(items, { now: nowMs });
    expect(groups[0].label).toBe("Today");
  });

  it("sorts mixed item kinds within a day in upstream order", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "d", occurredAt: localIso(2026, 6, 1, 14) }),
      makeSnapshotItem({ key: "s", occurredAt: localIso(2026, 6, 1, 12) }),
    ];
    const groups = buildTimelineDayGroups(items);
    expect(groups[0].items.map((i) => i.key)).toEqual(["d", "s"]);
  });

  it("includes event count in each group", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 1, 10) }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 6, 1, 11) }),
      makeDiaryItem({ key: "c", occurredAt: localIso(2026, 6, 2, 9) }),
    ];
    const groups = buildTimelineDayGroups(items);
    expect(groups[0].count).toBe(1);
    expect(groups[1].count).toBe(2);
  });

  it("returns groups in descending chronological order", () => {
    const items: TimelineMemoryItem[] = [
      makeDiaryItem({ key: "a", occurredAt: localIso(2026, 6, 1, 10) }),
      makeDiaryItem({ key: "b", occurredAt: localIso(2026, 5, 28, 10) }),
      makeDiaryItem({ key: "c", occurredAt: localIso(2026, 6, 3, 10) }),
    ];
    const groups = buildTimelineDayGroups(items);
    expect(groups.map((g) => g.dayKey)).toEqual([
      "2026-06-03",
      "2026-06-01",
      "2026-05-28",
    ]);
  });
});

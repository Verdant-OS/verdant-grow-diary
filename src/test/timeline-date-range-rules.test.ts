/**
 * timelineDateRangeRules — local-day date-range boundary builder
 * (issue #587: Timeline's date filter must use the grower's own local day,
 * not a UTC day, for its Supabase query bounds).
 *
 * Timezone-sensitive cases run through `withTimeZone`, which sets
 * `process.env.TZ` synchronously around a single call and restores it in a
 * `finally` — the module under test resolves local time from the numeric
 * `Date` constructor (never `Intl`), which re-resolves the current process
 * timezone on every call, so this is sufficient without spawning a
 * subprocess per zone.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildTimelineLocalDateRangeBounds,
  type TimelineDateRangeBounds,
} from "@/lib/timelineDateRangeRules";

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

function buildIn(tz: string, input: Parameters<typeof buildTimelineLocalDateRangeBounds>[0]) {
  return withTimeZone(tz, () => buildTimelineLocalDateRangeBounds(input));
}

const HOUR_MS = 60 * 60 * 1000;

function spanMs(bounds: TimelineDateRangeBounds): number {
  expect(bounds.startIso).not.toBeNull();
  expect(bounds.endIso).not.toBeNull();
  return (
    new Date(bounds.endIso as string).getTime() - new Date(bounds.startIso as string).getTime()
  );
}

describe("buildTimelineLocalDateRangeBounds — America/Chicago", () => {
  it("an ordinary summer day spans exactly 24 local hours", () => {
    const bounds = buildIn("America/Chicago", { startDate: "2026-07-15", endDate: "2026-07-15" });
    expect(bounds).toEqual({
      startIso: "2026-07-15T05:00:00.000Z",
      endIso: "2026-07-16T04:59:59.999Z",
    });
    expect(spanMs(bounds)).toBe(24 * HOUR_MS - 1);
  });

  it("the spring-forward transition day (2026-03-08) spans 23 real hours", () => {
    const bounds = buildIn("America/Chicago", { startDate: "2026-03-08", endDate: "2026-03-08" });
    expect(spanMs(bounds)).toBe(23 * HOUR_MS - 1);
  });

  it("the fall-back transition day (2026-11-01) spans 25 real hours", () => {
    const bounds = buildIn("America/Chicago", { startDate: "2026-11-01", endDate: "2026-11-01" });
    expect(spanMs(bounds)).toBe(25 * HOUR_MS - 1);
  });

  it("the day immediately before/after a DST transition is an ordinary 24-hour day", () => {
    expect(
      spanMs(buildIn("America/Chicago", { startDate: "2026-03-07", endDate: "2026-03-07" })),
    ).toBe(24 * HOUR_MS - 1);
    expect(
      spanMs(buildIn("America/Chicago", { startDate: "2026-11-02", endDate: "2026-11-02" })),
    ).toBe(24 * HOUR_MS - 1);
  });
});

describe("buildTimelineLocalDateRangeBounds — UTC", () => {
  it("appends the boundary times directly, with no offset", () => {
    expect(buildIn("UTC", { startDate: "2026-07-15", endDate: "2026-07-15" })).toEqual({
      startIso: "2026-07-15T00:00:00.000Z",
      endIso: "2026-07-15T23:59:59.999Z",
    });
  });
});

describe("buildTimelineLocalDateRangeBounds — Asia/Tokyo (positive offset, no DST)", () => {
  it("crosses into the previous UTC calendar day", () => {
    expect(buildIn("Asia/Tokyo", { startDate: "2026-07-15", endDate: "2026-07-15" })).toEqual({
      startIso: "2026-07-14T15:00:00.000Z",
      endIso: "2026-07-15T14:59:59.999Z",
    });
  });
});

describe("buildTimelineLocalDateRangeBounds — calendar validity", () => {
  it("resolves a leap day (2028-02-29) normally", () => {
    const bounds = buildIn("UTC", { startDate: "2028-02-29", endDate: "2028-02-29" });
    expect(bounds).toEqual({
      startIso: "2028-02-29T00:00:00.000Z",
      endIso: "2028-02-29T23:59:59.999Z",
    });
  });

  it("rejects an impossible date instead of rolling into another day", () => {
    expect(buildIn("UTC", { startDate: "2026-02-30", endDate: null })).toEqual({
      startIso: null,
      endIso: null,
    });
    expect(buildIn("America/Chicago", { startDate: null, endDate: "2026-02-30" })).toEqual({
      startIso: null,
      endIso: null,
    });
  });

  it("rejects malformed strings", () => {
    for (const bad of [
      "2026-7-1",
      "07/01/2026",
      "2026-07-01T00:00:00Z",
      "not-a-date",
      "2026-13-01",
    ]) {
      expect(buildTimelineLocalDateRangeBounds({ startDate: bad, endDate: null })).toEqual({
        startIso: null,
        endIso: null,
      });
    }
  });
});

describe("buildTimelineLocalDateRangeBounds — bounds shape", () => {
  it("blank/null input produces no bounds", () => {
    expect(buildTimelineLocalDateRangeBounds({ startDate: null, endDate: null })).toEqual({
      startIso: null,
      endIso: null,
    });
    expect(buildTimelineLocalDateRangeBounds({ startDate: "", endDate: undefined })).toEqual({
      startIso: null,
      endIso: null,
    });
    expect(buildTimelineLocalDateRangeBounds({})).toEqual({ startIso: null, endIso: null });
  });

  it("is repeatable — identical input in the identical zone yields identical output", () => {
    const first = buildIn("America/Chicago", { startDate: "2026-07-15", endDate: "2026-07-20" });
    const second = buildIn("America/Chicago", { startDate: "2026-07-15", endDate: "2026-07-20" });
    expect(second).toEqual(first);
  });

  it("start-only leaves endIso unbounded", () => {
    const bounds = buildIn("UTC", { startDate: "2026-07-15" });
    expect(bounds.startIso).toBe("2026-07-15T00:00:00.000Z");
    expect(bounds.endIso).toBeNull();
  });

  it("end-only leaves startIso unbounded", () => {
    const bounds = buildIn("UTC", { endDate: "2026-07-15" });
    expect(bounds.startIso).toBeNull();
    expect(bounds.endIso).toBe("2026-07-15T23:59:59.999Z");
  });

  it("an inverted range (start after end) applies no bound, same as the existing no-op contract", () => {
    expect(buildIn("America/Chicago", { startDate: "2026-07-20", endDate: "2026-07-10" })).toEqual({
      startIso: null,
      endIso: null,
    });
  });

  it("equal start and end dates produce a normal one-day range, not an inversion", () => {
    const bounds = buildIn("UTC", { startDate: "2026-07-15", endDate: "2026-07-15" });
    expect(bounds.startIso).not.toBeNull();
    expect(bounds.endIso).not.toBeNull();
  });
});

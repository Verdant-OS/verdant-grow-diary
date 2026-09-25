/**
 * QA 2026-09-24:
 *  - BUG-004: a start date picked as 07/01/2026 was stored as UTC midnight
 *    and shown as "Jun 30, 2026" in US Central.
 *  - BUG-005: a future start date was accepted ("AGE -463 days"), and
 *    "Last activity: Updated 3 months ago" was computed from the start date.
 *  - BUG-013: the daily check marked days before the plant existed "Missed".
 *
 * Timezone-sensitive cases run through `withTimeZone`, the same pattern as
 * timeline-date-range-rules.test.ts: the rules resolve local time through the
 * numeric Date API, which re-reads `process.env.TZ` on each call.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { format } from "date-fns";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatPlantAge,
  plantStartDateInputMax,
  plantStartDateInputToIso,
  plantStartDateInputValue,
  plantStartDisplayDate,
  resolvePlantAge,
  resolvePlantStartCalendarDate,
} from "@/lib/plantStartDateRules";
import {
  PLANT_LAST_ACTIVITY_LOADING,
  PLANT_LAST_ACTIVITY_NONE,
  PLANT_LAST_ACTIVITY_UNAVAILABLE,
  resolvePlantLastActivityLabel,
  resolvePlantLastActivitySummary,
} from "@/lib/plantLastActivityRules";
import {
  buildDailyGrowCheckConsistency,
  buildDailyMethodBreakdown,
  formatDailyMethodBreakdownLabel,
} from "@/lib/dailyGrowCheckConsistencyRules";

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

describe("plant start date is a calendar date (BUG-004)", () => {
  it("shows a legacy UTC-midnight row as the day the grower picked, in US Central", () => {
    withTimeZone("America/Chicago", () => {
      const legacy = "2026-07-01T00:00:00+00:00";
      // The pre-fix display: format(new Date(iso), "PP") → the day before.
      expect(format(new Date(legacy), "PP")).toBe("Jun 30, 2026");
      expect(format(plantStartDisplayDate(legacy)!, "PP")).toBe("Jul 1, 2026");
      expect(plantStartDateInputValue(legacy)).toBe("2026-07-01");
      expect(plantStartDateInputValue("2027-12-31T00:00:00.000Z")).toBe("2027-12-31");
    });
  });

  it("saves the picked day as a timezone-independent date and reads it back as that day", () => {
    for (const tz of ["America/Chicago", "Australia/Brisbane", "Pacific/Auckland", "UTC"]) {
      withTimeZone(tz, () => {
        const now = new Date(2026, 8, 24, 9, 0, 0);
        const saved = plantStartDateInputToIso("2026-07-01", now);
        expect(saved).toEqual({ ok: true, iso: "2026-07-01T00:00:00.000Z" });
        if (saved.ok !== true) return;
        expect(resolvePlantStartCalendarDate(saved.iso)).toEqual({
          year: 2026,
          month: 7,
          day: 1,
        });
        expect(plantStartDateInputValue(saved.iso)).toBe("2026-07-01");
        expect(format(plantStartDisplayDate(saved.iso)!, "PP")).toBe("Jul 1, 2026");
      });
    }
  });

  it("a date picked in one zone reads as the same day on a device in another", () => {
    const saved = withTimeZone("Pacific/Auckland", () =>
      plantStartDateInputToIso("2026-07-01", new Date(2026, 8, 24, 9, 0, 0)),
    );
    expect(saved.ok).toBe(true);
    if (saved.ok !== true) return;
    for (const tz of ["America/Los_Angeles", "America/Chicago", "Europe/London", "Asia/Tokyo"]) {
      withTimeZone(tz, () => {
        expect(plantStartDateInputValue(saved.iso)).toBe("2026-07-01");
        expect(format(plantStartDisplayDate(saved.iso)!, "PP")).toBe("Jul 1, 2026");
      });
    }
    // As PostgREST returns the timestamptz.
    withTimeZone("America/Los_Angeles", () => {
      expect(plantStartDateInputValue("2026-07-01T00:00:00+00:00")).toBe("2026-07-01");
    });
  });

  it("reads a non-midnight instant (default now()) in the grower's zone", () => {
    withTimeZone("America/Chicago", () => {
      // 02:30 UTC on Sep 24 is still Sep 23 in Chicago.
      expect(plantStartDateInputValue("2026-09-24T02:30:00+00:00")).toBe("2026-09-23");
    });
  });

  it("rejects malformed and impossible dates", () => {
    const now = new Date(2026, 8, 24);
    expect(plantStartDateInputToIso("", now)).toEqual({ ok: false, reason: "invalid" });
    expect(plantStartDateInputToIso("07/01/2026", now)).toEqual({ ok: false, reason: "invalid" });
    expect(plantStartDateInputToIso("2026-02-30", now)).toEqual({ ok: false, reason: "invalid" });
    expect(resolvePlantStartCalendarDate("not a date")).toBeNull();
    expect(plantStartDisplayDate(null)).toBeNull();
  });
});

describe("start date validation and age (BUG-005)", () => {
  it("rejects a future start date and caps the input at today", () => {
    withTimeZone("America/Chicago", () => {
      const now = new Date(2026, 8, 24, 2, 14, 0);
      expect(plantStartDateInputToIso("2027-12-31", now)).toEqual({ ok: false, reason: "future" });
      expect(plantStartDateInputToIso("2026-09-25", now)).toEqual({ ok: false, reason: "future" });
      expect(plantStartDateInputToIso("2026-09-24", now).ok).toBe(true);
      expect(plantStartDateInputMax(now)).toBe("2026-09-24");
    });
  });

  it("never renders a negative age", () => {
    withTimeZone("America/Chicago", () => {
      const now = new Date(2026, 8, 24, 2, 14, 0);
      expect(formatPlantAge(resolvePlantAge("2027-12-31T00:00:00+00:00", now))).toBe(
        "Starts in 463 days",
      );
      expect(formatPlantAge(resolvePlantAge("2026-07-01T00:00:00+00:00", now))).toBe("85 days");
      expect(formatPlantAge(resolvePlantAge(new Date(2026, 8, 24).toISOString(), now))).toBe(
        "0 days",
      );
      expect(formatPlantAge(resolvePlantAge(new Date(2026, 8, 23).toISOString(), now))).toBe(
        "1 day",
      );
      expect(formatPlantAge(resolvePlantAge("garbage", now))).toBe("Unknown");
    });
  });

  it("describes last activity from the newest diary entry, not the start date", () => {
    const now = new Date("2026-09-24T07:40:00Z");
    expect(
      resolvePlantLastActivityLabel({
        status: "ready",
        rows: [
          { entry_at: "2026-09-24T07:20:00Z" },
          { entry_at: "2026-09-24T07:35:00Z" },
          { entry_at: null, created_at: "2026-09-20T07:35:00Z" },
        ],
        now,
      }),
    ).toBe("Updated 5 minutes ago");
    expect(resolvePlantLastActivityLabel({ status: "ready", rows: [], now })).toBe(
      PLANT_LAST_ACTIVITY_NONE,
    );
    expect(resolvePlantLastActivityLabel({ status: "loading", rows: undefined, now })).toBe(
      PLANT_LAST_ACTIVITY_LOADING,
    );
    expect(resolvePlantLastActivityLabel({ status: "error", rows: [], now })).toBe(
      PLANT_LAST_ACTIVITY_UNAVAILABLE,
    );
    expect(
      resolvePlantLastActivityLabel({
        status: "ready",
        rows: [{ entry_at: "2026-09-24T07:45:00Z" }],
        now,
      }),
    ).toBe("Updated less than a minute ago");
  });

  it("Plant Detail no longer derives age or last activity from raw startedAt math", () => {
    // @source-scan-justified: proves the pre-fix expressions are absent from
    // the page; they are call expressions, not resolvable configuration.
    const page = readFileSync(resolve(process.cwd(), "src/pages/PlantDetail.tsx"), "utf8");
    expect(page).not.toMatch(/Date\.now\(\) - new Date\(plant\.startedAt\)/);
    expect(page).not.toMatch(/formatDistanceToNow\(new Date\(plant\.startedAt\)/);
    expect(page).not.toMatch(/format\(new Date\(plant\.startedAt\)/);
    for (const dialog of [
      "src/components/CreatePlantDialog.tsx",
      "src/components/EditPlantDialog.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), dialog), "utf8");
      expect(src).not.toMatch(/new Date\(form\.started_at\)\.toISOString\(\)/);
      expect(src).not.toMatch(/startedAt\.slice\(0, 10\)/);
      expect(src).toMatch(/plantStartDateInputToIso\(form\.started_at, new Date\(\)\)/);
    }
  });
});

describe("daily check does not count days before tracking started (BUG-013)", () => {
  const now = new Date(2026, 8, 24, 15, 0, 0);
  const base = {
    now,
    windowDays: 7,
    plantId: "plant-1",
    currentTentId: "tent-1",
    plantsInTentCount: 1,
    manualReadings: [],
  };

  it("marks pre-creation days not tracked instead of missed", () => {
    const summary = buildDailyGrowCheckConsistency({
      ...base,
      trackingStartedAt: new Date(2026, 8, 24, 9, 0, 0).toISOString(),
      diaryEntries: [
        {
          entry_at: new Date(2026, 8, 24, 10, 0, 0).toISOString(),
          created_at: new Date(2026, 8, 24, 10, 0, 0).toISOString(),
          id: "e1",
          plant_id: "plant-1",
          tent_id: "tent-1",
        },
      ],
    });
    expect(summary.checkedDays).toBe(1);
    expect(summary.untrackedDays).toBe(6);
    expect(summary.missedDays).toBe(0);
    const breakdown = buildDailyMethodBreakdown(summary, "oldest-first");
    expect(breakdown.map((d) => d.method)).toEqual([
      "not-tracked",
      "not-tracked",
      "not-tracked",
      "not-tracked",
      "not-tracked",
      "not-tracked",
      "note",
    ]);
    expect(formatDailyMethodBreakdownLabel("not-tracked")).toBe("Not tracked");
  });

  it("still counts a back-dated log on a day before creation as checked", () => {
    const summary = buildDailyGrowCheckConsistency({
      ...base,
      trackingStartedAt: new Date(2026, 8, 24, 9, 0, 0).toISOString(),
      diaryEntries: [
        {
          entry_at: new Date(2026, 8, 22, 10, 0, 0).toISOString(),
          created_at: new Date(2026, 8, 24, 10, 0, 0).toISOString(),
          id: "e-backdated",
          plant_id: "plant-1",
          tent_id: "tent-1",
        },
      ],
    });
    expect(summary.checkedDays).toBe(1);
    expect(summary.untrackedDays).toBe(5);
    expect(summary.missedDays).toBe(1);
  });

  it("keeps the existing behaviour when no tracking start is supplied", () => {
    const summary = buildDailyGrowCheckConsistency({ ...base, diaryEntries: [] });
    expect(summary.missedDays).toBe(7);
    expect(summary).not.toHaveProperty("trackingStartDayKey");
    expect(buildDailyMethodBreakdown(summary).every((d) => d.method === "missed")).toBe(true);
  });
});

describe("last activity text and time come from the same diary row (Codex, #1683)", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const rows = [
    {
      id: "older",
      entry_at: "2026-09-20T12:00:00Z",
      note: "Old observation",
      details: { event_type: "observation" },
    },
    {
      id: "newest",
      entry_at: "2026-09-24T10:00:00Z",
      note: "Watered 1 L to runoff\nsecond line",
      details: { event_type: "watering" },
    },
  ];

  it("summarises the newest row the label is computed from", () => {
    const input = { status: "ready" as const, rows, now };
    expect(resolvePlantLastActivityLabel(input)).toBe("Updated about 2 hours ago");
    expect(resolvePlantLastActivitySummary(input)).toEqual({
      eventType: "watering",
      text: "Watered 1 L to runoff",
    });
  });

  it("breaks an entry-time tie by created_at, then id, whatever order the rows arrive in", () => {
    // Codex review on #1683: companion rows from one Quick Log action can
    // share entry_at, and the read orders by entry_at only, so the first row
    // returned must not decide which activity is shown.
    const sameEntry = "2026-09-24T10:00:00Z";
    const tiedByCreated = [
      {
        id: "b",
        entry_at: sameEntry,
        created_at: "2026-09-24T10:00:01Z",
        note: "Earlier companion",
        details: { event_type: "observation" },
      },
      {
        id: "a",
        entry_at: sameEntry,
        created_at: "2026-09-24T10:00:02Z",
        note: "Later companion",
        details: { event_type: "watering" },
      },
    ];
    const tiedById = [
      { id: "a", entry_at: sameEntry, note: "Row a", details: { event_type: "observation" } },
      { id: "b", entry_at: sameEntry, note: "Row b", details: { event_type: "watering" } },
    ];
    for (const set of [tiedByCreated, tiedById]) {
      const forward = resolvePlantLastActivitySummary({ status: "ready", rows: set, now });
      const reversed = resolvePlantLastActivitySummary({
        status: "ready",
        rows: [...set].reverse(),
        now,
      });
      expect(reversed).toEqual(forward);
    }
    expect(resolvePlantLastActivitySummary({ status: "ready", rows: tiedByCreated, now })).toEqual({
      eventType: "watering",
      text: "Later companion",
    });
    expect(resolvePlantLastActivitySummary({ status: "ready", rows: tiedById, now })).toEqual({
      eventType: "watering",
      text: "Row b",
    });
  });

  it("an entry with no note keeps its type and empty text", () => {
    expect(
      resolvePlantLastActivitySummary({
        status: "ready",
        rows: [{ id: "a", entry_at: "2026-09-24T10:00:00Z", note: "", details: {} }],
        now,
      }),
    ).toEqual({ eventType: "note", text: "" });
  });

  it("has no summary while loading, after a failed read, or with no rows", () => {
    expect(resolvePlantLastActivitySummary({ status: "loading", rows: undefined, now })).toBeNull();
    expect(resolvePlantLastActivitySummary({ status: "error", rows, now })).toBeNull();
    expect(resolvePlantLastActivitySummary({ status: "ready", rows: [], now })).toBeNull();
  });
});

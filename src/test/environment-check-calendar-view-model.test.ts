/**
 * Tests for environmentCheckCalendarViewModel — pure helper.
 * No I/O. No Supabase. No Action Queue. No AI.
 */
import { describe, it, expect } from "vitest";
import {
  buildEnvironmentCheckCalendarGroups,
  ENVIRONMENT_CHECK_CALENDAR_LABEL,
  ENVIRONMENT_CHECK_CALENDAR_SUBTITLE,
} from "@/lib/environmentCheckCalendarViewModel";

const make = (id: string, ts: string) => ({
  id,
  entry_at: ts,
  event_type: "environment",
  note: null,
  details: {
    environment_check: { temp_c: 23.5, humidity_pct: 55, vpd_kpa: 1.05 },
  },
});

describe("environmentCheckCalendarViewModel", () => {
  it("groups Environment Check entries by UTC day and labels them safely", () => {
    const groups = buildEnvironmentCheckCalendarGroups([
      make("a", "2026-06-15T08:00:00Z"),
      make("b", "2026-06-15T22:30:00Z"),
      make("c", "2026-06-16T03:00:00Z"),
    ]);
    expect(groups.map((g) => g.dateKey)).toEqual(["2026-06-16", "2026-06-15"]);
    expect(groups[1].events).toHaveLength(2);
    expect(groups[1].events[0].label).toBe(ENVIRONMENT_CHECK_CALENDAR_LABEL);
    expect(groups[1].events[0].subtitle).toBe(ENVIRONMENT_CHECK_CALENDAR_SUBTITLE);
  });

  it("never labels Environment Check calendar events as live or sensor readings", () => {
    const groups = buildEnvironmentCheckCalendarGroups([make("a", "2026-06-15T08:00:00Z")]);
    expect(JSON.stringify(groups)).not.toMatch(/\blive\b/i);
    expect(groups[0].events[0].isSensorReading).toBe(false);
    expect(groups[0].events[0].notLive).toBe(true);
  });

  it("ignores non-environment entries safely", () => {
    const groups = buildEnvironmentCheckCalendarGroups([
      { id: "w", entry_at: "2026-06-15T00:00:00Z", event_type: "watering" } as never,
      make("a", "2026-06-15T08:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a"]);
  });

  it("returns empty array on null/undefined input", () => {
    expect(buildEnvironmentCheckCalendarGroups(null)).toEqual([]);
    expect(buildEnvironmentCheckCalendarGroups(undefined)).toEqual([]);
  });
});

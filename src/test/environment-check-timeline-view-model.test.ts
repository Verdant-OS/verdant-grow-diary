/**
 * Tests for environmentCheckTimelineViewModel — pure presenter helper.
 * No I/O. No Supabase. No Action Queue. No AI.
 */
import { describe, it, expect } from "vitest";
import {
  buildEnvironmentCheckTimelineList,
  buildEnvironmentCheckTimelineViewModel,
  ENVIRONMENT_CHECK_TIMELINE_SOURCE_LABEL,
  ENVIRONMENT_CHECK_TIMELINE_TITLE,
  isEnvironmentCheckTimelineEntry,
} from "@/lib/environmentCheckTimelineViewModel";

const envEntry = {
  id: "e-1",
  entry_at: "2026-06-15T18:30:00.000Z",
  event_type: "environment",
  note: "Tent looks balanced.",
  details: {
    environment_check: {
      temp_c: 24.6,
      humidity_pct: 58,
      vpd_kpa: 1.12,
      co2_ppm: 850,
      note: "Lights on cycle 6/14",
    },
  },
};

describe("environmentCheckTimelineViewModel", () => {
  it("renders environment Quick Log entry on the correct day with safe labels", () => {
    const vm = buildEnvironmentCheckTimelineViewModel(envEntry);
    expect(vm).not.toBeNull();
    expect(vm!.dateKey).toBe("2026-06-15");
    expect(vm!.title).toBe(ENVIRONMENT_CHECK_TIMELINE_TITLE);
    expect(vm!.sourceLabel).toBe(ENVIRONMENT_CHECK_TIMELINE_SOURCE_LABEL);
    expect(vm!.isSensorReading).toBe(false);
    expect(vm!.notLive).toBe(true);
    const keys = vm!.fields.map((f) => f.key).sort();
    expect(keys).toEqual(["co2", "humidity", "temp", "vpd"]);
  });

  it("never labels environment check data as live", () => {
    const vm = buildEnvironmentCheckTimelineViewModel(envEntry)!;
    expect(JSON.stringify(vm)).not.toMatch(/\blive\b/i);
  });

  it("returns null for non-environment entries", () => {
    expect(
      buildEnvironmentCheckTimelineViewModel({
        id: "x",
        entry_at: "2026-06-15T00:00:00Z",
        event_type: "watering",
      }),
    ).toBeNull();
  });

  it("does not throw on malformed inputs", () => {
    expect(() => buildEnvironmentCheckTimelineViewModel(null)).not.toThrow();
    expect(() => buildEnvironmentCheckTimelineViewModel({} as never)).not.toThrow();
    expect(buildEnvironmentCheckTimelineViewModel({ id: "", entry_at: "x" })).toBeNull();
  });

  it("isEnvironmentCheckTimelineEntry accepts environment_check details fallback", () => {
    expect(
      isEnvironmentCheckTimelineEntry({
        id: "z",
        entry_at: "2026-01-01T00:00:00Z",
        details: { environment_check: { temp_c: 22 } },
      }),
    ).toBe(true);
  });

  it("sorts list newest-first with stable id tiebreaker", () => {
    const list = buildEnvironmentCheckTimelineList([
      { ...envEntry, id: "b", entry_at: "2026-06-15T10:00:00Z" },
      { ...envEntry, id: "a", entry_at: "2026-06-15T10:00:00Z" },
      { ...envEntry, id: "c", entry_at: "2026-06-16T10:00:00Z" },
    ]);
    expect(list.map((v) => v.entryId)).toEqual(["c", "a", "b"]);
  });

  it("falls back to entry note when envelope is missing", () => {
    const vm = buildEnvironmentCheckTimelineViewModel({
      id: "n-1",
      entry_at: "2026-06-15T18:30:00Z",
      event_type: "environment",
      note: "Plants happy.",
    })!;
    expect(vm.fields).toEqual([]);
    expect(vm.noteSummary).toBe("Plants happy.");
  });
});

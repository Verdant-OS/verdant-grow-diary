/**
 * Tests for environmentCheckTimelineViewModel — pure presenter helper.
 * No I/O. No Supabase. No Action Queue. No AI.
 */
import { describe, it, expect } from "vitest";
import { buildEnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";
import {
  buildEnvironmentCheckDiaryEntryInput,
  buildEnvironmentCheckTimelineList,
  buildEnvironmentCheckTimelineViewModel,
  ENVIRONMENT_CHECK_TIMELINE_SOURCE_LABEL,
  ENVIRONMENT_CHECK_TIMELINE_TITLE,
  isEnvironmentCheckTimelineEntry,
  resolveEffectiveQuickLogCareType,
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

  it("never labels environment check data as live (positive flags only)", () => {
    const vm = buildEnvironmentCheckTimelineViewModel(envEntry)!;
    expect(vm.notLive).toBe(true);
    expect(vm.isSensorReading).toBe(false);
    expect(JSON.stringify(vm)).not.toMatch(/"source"\s*:\s*"live"/i);
    expect(JSON.stringify(vm)).not.toMatch(/"status"\s*:\s*"live"/i);
  });

  it("converts a legacy Fahrenheit-only entry to Celsius when the preference is celsius", () => {
    const legacyFahrenheitOnly = {
      id: "e-2",
      entry_at: "2026-06-15T18:30:00.000Z",
      event_type: "environment",
      details: {
        environment_check: { room_temp_f: 75.2, humidity_pct: 58 },
      },
    };
    const vm = buildEnvironmentCheckTimelineViewModel(legacyFahrenheitOnly, "celsius")!;
    const temp = vm.fields.find((f) => f.key === "temp");
    expect(temp?.value).toBe("24.0°C");
  });

  it("keeps a legacy Fahrenheit-only entry in Fahrenheit under the fahrenheit preference", () => {
    const legacyFahrenheitOnly = {
      id: "e-3",
      entry_at: "2026-06-15T18:30:00.000Z",
      event_type: "environment",
      details: {
        environment_check: { room_temp_f: 75.2 },
      },
    };
    const vm = buildEnvironmentCheckTimelineViewModel(legacyFahrenheitOnly, "fahrenheit")!;
    const temp = vm.fields.find((f) => f.key === "temp");
    expect(temp?.value).toBe("75.2°F");
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

  it("resolves a legacy Observation with an environment envelope as Environment", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        entry_type: "observation",
        details: { event_type: "observation", environment_check: { temp_c: 24 } },
      }),
    ).toBe("environment");
  });

  it("keeps Watering authoritative when sensor context is attached", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        entry_type: "watering",
        details: {
          event_type: "watering",
          sensor: { source: "manual" },
          environment_check: { temp_c: 24 },
        },
      }),
    ).toBe("watering");
  });

  it("keeps a details-only Watering authoritative over an environment envelope", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        details: {
          event_type: "watering",
          environment_check: { temp_c: 24 },
        },
      }),
    ).toBe("watering");
  });

  it("keeps a details-only Action Follow-up authoritative over environment context", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        details: {
          event_type: "action_followup",
          action_queue_id: "private-row-id",
          environment_check: { temp_c: 24 },
        },
      }),
    ).toBe("action_followup");
  });

  it("keeps an ordinary Observation out of the Environment lane", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        event_type: "observation",
        details: { note_kind: "visual" },
      }),
    ).toBe("observation");
  });

  it("fails safely on malformed details without inventing a care type", () => {
    expect(resolveEffectiveQuickLogCareType({ event_type: "observation", details: "bad" })).toBe(
      "observation",
    );
    expect(resolveEffectiveQuickLogCareType({ details: { environment_check: [] } })).toBeNull();
    expect(resolveEffectiveQuickLogCareType(null)).toBeNull();
  });

  it("adapts the nested measured envelope and canonical diary timestamp for rule evaluation", () => {
    expect(
      buildEnvironmentCheckDiaryEntryInput({
        id: "env-measured",
        entry_at: "2026-06-11T12:34:56Z",
        details: {
          event_type: "observation",
          source: "manual",
          environment_check: { temp_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
        },
      }),
    ).toEqual({
      entryId: "env-measured",
      occurredAt: "2026-06-11T12:34:56.000Z",
      kind: "environment",
      snapshot: { source: "manual", tempC: 24, rhPercent: 55, vpdKpa: 1.2 },
    });
  });

  it("keeps a forged live source manual before Timeline badge evaluation", () => {
    const input = buildEnvironmentCheckDiaryEntryInput({
      id: "env-forged-live",
      entry_at: "2026-06-11T12:34:56Z",
      details: {
        event_type: "environment",
        source: "live",
        environment_check: {
          source: "live",
          temp_c: 24,
          humidity_pct: 55,
          vpd_kpa: 1.2,
        },
      },
    });

    expect(input?.snapshot?.source).toBe("manual");
    expect(buildEnvironmentCheckDiaryViewModel(input!).sourceLabel).toBe("manual");
  });

  it.each([
    ["temperature", { temp_c: 44, humidity_pct: 55, vpd_kpa: 1.2 }],
    ["humidity", { temp_c: 24, humidity_pct: 101, vpd_kpa: 1.2 }],
    ["VPD", { temp_c: 24, humidity_pct: 55, vpd_kpa: 3.01 }],
  ])("rejects out-of-range nested %s before Timeline badge evaluation", (_metric, envelope) => {
    expect(
      buildEnvironmentCheckDiaryEntryInput({
        id: "env-out-of-range",
        entry_at: "2026-06-11T12:34:56Z",
        details: {
          event_type: "environment",
          environment_check: envelope,
        },
      }),
    ).toBeNull();
  });

  it("converts a legacy Fahrenheit-only envelope once and rejects unusable rows", () => {
    const converted = buildEnvironmentCheckDiaryEntryInput({
      id: "env-fahrenheit",
      occurred_at: "2026-06-11T12:00:00Z",
      details: {
        event_type: "environment",
        environment_check: { room_temp_f: 75.2 },
      },
    });
    expect(converted?.snapshot?.tempC).toBeCloseTo(24, 8);
    expect(converted?.snapshot?.source).toBe("manual");
    expect(
      buildEnvironmentCheckDiaryEntryInput({
        id: "bad-time",
        entry_at: "not-a-time",
        details: { event_type: "environment", environment_check: { temp_c: 24 } },
      }),
    ).toBeNull();
    expect(
      buildEnvironmentCheckDiaryEntryInput({
        id: "watering",
        entry_at: "2026-06-11T12:00:00Z",
        details: { event_type: "watering", environment_check: { temp_c: 24 } },
      }),
    ).toBeNull();
  });
});

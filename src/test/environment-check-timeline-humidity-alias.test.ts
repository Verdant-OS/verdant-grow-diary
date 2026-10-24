/**
 * CodeRabbit on #2316: the Timeline card's buildFields read RH from
 * humidity_pct / rhPercent / rh_percent only, so an Environment check whose
 * envelope stores just `humidity` showed no RH, while the diary snapshot and
 * the correction note (both via environmentCheckEnvelopeReadings) counted it.
 */
import { describe, expect, it } from "vitest";
import {
  buildEnvironmentCheckDiaryEntryInput,
  buildEnvironmentCheckTimelineViewModel,
} from "@/lib/environmentCheckTimelineViewModel";

const entry = {
  id: "env-humidity-alias",
  entry_at: "2026-06-15T18:30:00.000Z",
  details: { event_type: "environment", environment_check: { humidity: 55 } },
};

describe("Environment check Timeline card humidity alias", () => {
  it("shows RH for an envelope that stores only the humidity alias", () => {
    expect(buildEnvironmentCheckTimelineViewModel(entry)?.fields).toEqual([
      { key: "humidity", label: "RH", value: "55%" },
    ]);
  });

  it("agrees with the diary snapshot, which already reads the alias", () => {
    expect(buildEnvironmentCheckDiaryEntryInput(entry)?.snapshot?.rhPercent).toBe(55);
  });

  it("still prefers humidity_pct over the alias", () => {
    const both = {
      ...entry,
      details: { ...entry.details, environment_check: { humidity_pct: 60, humidity: 55 } },
    };
    expect(buildEnvironmentCheckTimelineViewModel(both)?.fields).toEqual([
      { key: "humidity", label: "RH", value: "60%" },
    ]);
  });
});

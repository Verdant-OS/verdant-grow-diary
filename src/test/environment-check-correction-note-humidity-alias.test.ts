/**
 * Regression fence for #2319: legacy envelopes that store RH under `humidity`
 * must agree across Timeline cards, diary snapshots, and correction-dialog copy.
 */
import { describe, expect, it } from "vitest";
import { quickLogCorrectionEnvironmentCheckReadingsNote } from "@/lib/quick-log/quickLogRevisionRules";
import {
  buildEnvironmentCheckDiaryEntryInput,
  buildEnvironmentCheckTimelineViewModel,
  environmentCheckEnvelopeHasRecordedReading,
} from "@/lib/environmentCheckTimelineViewModel";

const HUMIDITY_ALIAS_ONLY = {
  event_type: "environment_check",
  environment_check: { checkType: "airflow", humidity: 55 },
};

describe("Environment check humidity alias — correction note parity", () => {
  it("treats the humidity alias as a recorded reading for the envelope-only note", () => {
    expect(environmentCheckEnvelopeHasRecordedReading(HUMIDITY_ALIAS_ONLY.environment_check)).toBe(
      true,
    );
    expect(
      quickLogCorrectionEnvironmentCheckReadingsNote(HUMIDITY_ALIAS_ONLY, {
        offersAirReadingFields: false,
      }),
    ).toMatch(/can't be corrected/i);
  });

  it("keeps Timeline card, diary snapshot, and parser agreement on the alias", () => {
    const entry = {
      id: "env-humidity-alias-correction",
      entry_at: "2026-06-15T18:30:00.000Z",
      details: HUMIDITY_ALIAS_ONLY,
    };
    expect(buildEnvironmentCheckTimelineViewModel(entry)?.fields).toEqual([
      { key: "humidity", label: "RH", value: "55%" },
    ]);
    expect(buildEnvironmentCheckDiaryEntryInput(entry)?.snapshot?.rhPercent).toBe(55);
  });

  it("does not warn when air-reading fields cover the parsed RH from the alias", () => {
    expect(
      quickLogCorrectionEnvironmentCheckReadingsNote(HUMIDITY_ALIAS_ONLY, {
        offersAirReadingFields: true,
      }),
    ).toBeNull();
  });
});

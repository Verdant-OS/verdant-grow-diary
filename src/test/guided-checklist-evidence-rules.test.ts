import { describe, expect, it } from "vitest";
import {
  resolveGuidedChecklistReadState,
  selectGuidedChecklistEvidence,
} from "@/lib/guidedChecklistEvidenceRules";
import { isGuidedChecklistReadingFresh } from "@/lib/guidedActionChecklistRules";
const now = Date.parse("2026-09-23T12:00:00Z");
const at = (age: number) => new Date(now - age).toISOString();
const manual = {
  id: "d1",
  grow_id: "g1",
  tent_id: "t1",
  entry_at: at(3_600_000),
  details: { manual_sensor_snapshot: { source: "manual", temp_f: 77 } },
};
const row = {
  tent_id: "t1",
  source: "live",
  quality: "ok",
  metric: "temperature_c",
  value: 25,
  captured_at: at(60_000),
};
const input = { now, growId: "g1", tentIds: ["t1"], readings: [], diaryEntries: [manual] };

describe("guided evidence scope and provenance", () => {
  it.each([{ grow_id: "other" }, { tent_id: "other" }, { tent_id: null }, { retracted_at: at(0) }])(
    "ignores diary evidence outside the selected scope or retracted: %j",
    (change) => {
      expect(
        selectGuidedChecklistEvidence({ ...input, diaryEntries: [{ ...manual, ...change }] }).t1,
      ).toBeNull();
    },
  );
  it.each([null, undefined])("handles absent arrays %j", (absent) => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        readings: absent,
        diaryEntries: absent,
        tentIds: absent,
      }),
    ).toEqual({});
  });
  it("ignores malformed records and empty or invalid manual payloads", () => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [
          null,
          [],
          1,
          { ...manual, details: {} },
          { ...manual, details: { manual_sensor_snapshot: { source: "manual", temp_f: "77" } } },
        ],
      }).t1,
    ).toBeNull();
  });
  it("does not accept manual payloads claiming live provenance", () => {
    expect(
      selectGuidedChecklistEvidence({
        ...input,
        diaryEntries: [
          { ...manual, details: { manual_sensor_snapshot: { source: "live", temp_f: 77 } } },
        ],
      }).t1,
    ).toBeNull();
  });
  it("keeps generic snapshots as diary evidence, never fresh telemetry", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [{ ...manual, details: { sensor_snapshot: { temp: 25, rh: 55 } } }],
    }).t1;
    expect(result?.source).toBe("diary");
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it.each([
    { source: "demo" },
    { source: "constructor" },
    { source: "home_assistant" },
    { quality: "invalid" },
    { raw_payload: { vendor: "ecowitt_windows_testbench" } },
    { value: null },
    { value: "" },
    { value: Infinity },
    { tent_id: "other" },
  ])("cannot hide usable manual evidence with a newer unusable row: %j", (change) => {
    expect(
      selectGuidedChecklistEvidence({ ...input, readings: [{ ...row, ...change }] }).t1?.source,
    ).toBe("manual");
  });
  it("never substitutes import/creation time for missing observation time", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [],
      readings: [{ ...row, captured_at: null, created_at: at(0) }],
    }).t1;
    expect(result?.capturedAt).toBeNull();
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it("keeps bad captured_at invalid even when ts is recent", () => {
    const result = selectGuidedChecklistEvidence({
      ...input,
      diaryEntries: [],
      readings: [{ ...row, captured_at: "invalid", ts: at(0) }],
    }).t1;
    expect(isGuidedChecklistReadingFresh(result, now)).toBe(false);
  });
  it("is deterministic without mutating inputs, including ties and reversed order", () => {
    const rows = Object.freeze([Object.freeze({ ...row, source: "manual" }), Object.freeze(row)]);
    const first = selectGuidedChecklistEvidence({ ...input, readings: rows });
    expect(selectGuidedChecklistEvidence({ ...input, readings: rows })).toEqual(first);
    expect(selectGuidedChecklistEvidence({ ...input, readings: [...rows].reverse() })).toEqual(
      first,
    );
    expect(first.t1?.source).toBe("live");
  });
  it("never uses another grow without an active grow", () => {
    expect(selectGuidedChecklistEvidence({ ...input, growId: null }).t1).toBeNull();
  });
});

describe("source-specific freshness", () => {
  it.each([
    ["manual", 86_400_000, true],
    ["manual", 86_400_001, false],
    ["live", 900_000, true],
    ["live", 900_001, false],
    ["live", -1, false],
    ["manual", -1, false],
    ["csv", 0, false],
    ["diary", 0, false],
  ] as const)("%s at %i ms old => %s", (source, age, expected) => {
    expect(isGuidedChecklistReadingFresh({ source, capturedAt: at(age), quality: "ok" }, now)).toBe(
      expected,
    );
  });
  it("rejects invalid clocks and missing observations", () => {
    expect(isGuidedChecklistReadingFresh({ source: "manual", capturedAt: at(0) }, NaN)).toBe(false);
    expect(isGuidedChecklistReadingFresh({ source: "live", capturedAt: null }, now)).toBe(false);
  });
});

describe("completed read gate", () => {
  it("requires completed alerts even if all query arrays exist", () => {
    expect(resolveGuidedChecklistReadState([{ data: [] }], "idle")).toBe("pending");
  });
  it("holds cached results while refreshing", () => {
    expect(resolveGuidedChecklistReadState([{ data: [], isFetching: true }], "ok")).toBe("pending");
  });
  it("does not interpret null as completed empty", () => {
    expect(resolveGuidedChecklistReadState([{ data: null }], "ok")).toBe("error");
  });
  it("accepts successfully completed empty reads", () => {
    expect(resolveGuidedChecklistReadState([{ data: [] }], "ok")).toBe("ready");
  });
});

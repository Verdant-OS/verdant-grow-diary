import { describe, expect, it } from "vitest";
import {
  resolveLegacyManualCorrections,
  type LegacyCorrectionReading,
  type LegacyCorrectionLink,
} from "@/lib/manualSensorLegacyCorrectionRules";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const a = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const b = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const c = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const time = "2026-09-15T08:00:00.123456+00:00";
function row(id = a, value = 25, captured_at = time): LegacyCorrectionReading {
  return {
    id,
    user_id: owner,
    tent_id: tent,
    metric: "temperature_c",
    value,
    source: "manual",
    captured_at,
    ts: captured_at,
  };
}
function link(original = a, replacement = b, old = 25, value = 24): LegacyCorrectionLink {
  return {
    original_reading_id: original,
    replacement_reading_id: replacement,
    user_id: owner,
    tent_id: tent,
    source_before: "manual",
    source_after: "manual",
    old_values: { temperature_c: old },
    new_values: { temperature_c: value },
    changed_fields: ["temperature_c"],
  };
}
const later = "2026-09-17T12:00:00Z";
describe("legacy correction evidence resolution", () => {
  it.each([null, undefined])(
    "treats missing reads as unavailable, never successful empty: %j",
    (missing) => {
      expect(resolveLegacyManualCorrections(owner, missing, [])).toEqual({ status: "unavailable" });
      expect(resolveLegacyManualCorrections(owner, [], missing)).toEqual({ status: "unavailable" });
    },
  );
  it("accepts a successfully read empty evidence set", () => {
    expect(resolveLegacyManualCorrections(owner, [], [])).toEqual({
      status: "resolved",
      readings: [],
      suppressedReplacementIds: [],
    });
  });
  it("rejects duplicate reading identities", () => {
    expect(resolveLegacyManualCorrections(owner, [row(), row(a, 24)], [])).toEqual({
      status: "unavailable",
    });
  });
  it("uses the replacement value but retains root identity, time and source", () => {
    expect(resolveLegacyManualCorrections(owner, [row(), row(b, 24, later)], [link()])).toEqual({
      status: "resolved",
      readings: [row(a, 24)],
      suppressedReplacementIds: [b],
    });
  });
  it("resolves a linear chain independent of input ordering", () => {
    const readings = [row(), row(b, 24, later), row(c, 23, later)];
    const links = [link(), link(b, c, 24, 23)];
    const result = resolveLegacyManualCorrections(owner, readings, links);
    expect(result).toEqual({
      status: "resolved",
      readings: [row(a, 23)],
      suppressedReplacementIds: [b, c],
    });
    expect(
      resolveLegacyManualCorrections(owner, [...readings].reverse(), [...links].reverse()),
    ).toEqual(result);
  });
  it("preserves unlinked readings without guessing orphan relationships", () => {
    expect(resolveLegacyManualCorrections(owner, [row(), row(b, 24, later)], [])).toEqual({
      status: "resolved",
      readings: [row(), row(b, 24, later)],
      suppressedReplacementIds: [],
    });
  });
  it.each([
    { tent_id: c },
    { user_id: c },
    { metric: "humidity_pct" },
    { source: "csv" },
    { value: 99 },
    { value: Number.NaN },
    { captured_at: "invalid" },
  ])("rejects inconsistent replacement evidence %j", (overrides) => {
    expect(
      resolveLegacyManualCorrections(
        owner,
        [row(), { ...row(b, 24, later), ...overrides }],
        [link()],
      ).status,
    ).toBe("unavailable");
  });
  it.each([
    { user_id: c },
    { tent_id: c },
    { source_before: "csv" },
    { source_after: "live" },
    { old_values: { temperature_c: 0 } },
    { new_values: { temperature_c: 0 } },
    { new_values: { temperature_c: 24, humidity_pct: 60 } },
    { changed_fields: ["humidity_pct"] },
    { replacement_reading_id: null },
  ])("rejects unverified legacy link %j", (overrides) => {
    expect(
      resolveLegacyManualCorrections(
        owner,
        [row(), row(b, 24, later)],
        [{ ...link(), ...overrides }],
      ).status,
    ).toBe("unavailable");
  });
  it("does not upgrade a replacement when its original is outside the readable history window", () => {
    expect(resolveLegacyManualCorrections(owner, [row(b, 24, later)], [link()]).status).toBe(
      "unavailable",
    );
  });
  it("rejects a missing replacement rather than claiming an unchanged reading", () => {
    expect(resolveLegacyManualCorrections(owner, [row()], [link()]).status).toBe("unavailable");
  });
  it("rejects branches even when one replacement has a later timestamp", () => {
    expect(
      resolveLegacyManualCorrections(
        owner,
        [row(), row(b, 24, later), row(c, 23, later)],
        [link(), link(a, c, 25, 23)],
      ).status,
    ).toBe("unavailable");
  });
  it("rejects two originals sharing one replacement", () => {
    expect(
      resolveLegacyManualCorrections(
        owner,
        [row(), row(c), row(b, 24, later)],
        [link(), link(c, b)],
      ).status,
    ).toBe("unavailable");
  });
  it("rejects cycles", () => {
    expect(
      resolveLegacyManualCorrections(owner, [row(), row(b, 24)], [link(), link(b, a, 24, 25)])
        .status,
    ).toBe("unavailable");
  });
  it("does not mutate input objects", () => {
    const readings = [row(), row(b, 24, later)],
      links = [link()];
    const before = JSON.stringify({ readings, links });
    resolveLegacyManualCorrections(owner, readings, links);
    expect(JSON.stringify({ readings, links })).toBe(before);
  });
});

import { describe, expect, it } from "vitest";
import { requireEffectiveSensorReadings } from "@/lib/effectiveSensorReadingRules";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tent = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const observed = "2026-09-15T08:00:00.123456+00:00";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: user,
    tent_id: tent,
    value: 24,
    metric: "temperature_c",
    source: "manual",
    quality: "manual_entry",
    ts: observed,
    created_at: observed,
    captured_at: observed,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    ...overrides,
  };
}

describe("requireEffectiveSensorReadings", () => {
  it("accepts a validated effective row and returns the same array reference shape", () => {
    const input = [row()];
    expect(requireEffectiveSensorReadings(input)).toEqual(input);
  });

  it("accepts an empty packet without inventing fallback readings", () => {
    expect(requireEffectiveSensorReadings([])).toEqual([]);
  });

  it("accepts null captured_at while still requiring root timestamps", () => {
    expect(requireEffectiveSensorReadings([row({ captured_at: null })])).toHaveLength(1);
  });

  it.each([null, undefined, {}, "bad", 0])("rejects non-array evidence packets: %j", (input) => {
    expect(() => requireEffectiveSensorReadings(input)).toThrow(/unavailable/i);
  });

  it.each([null, undefined, "bad", [], 0])("rejects malformed row entries: %j", (entry) => {
    expect(() => requireEffectiveSensorReadings([entry])).toThrow(/unavailable/i);
  });

  it("rejects duplicate reading identities instead of deduplicating", () => {
    const first = row();
    expect(() => requireEffectiveSensorReadings([first, { ...first }])).toThrow(/unavailable/i);
  });

  it.each([
    ["correction_valid", false],
    ["correction_valid", null],
    ["id", "not-a-uuid"],
    ["user_id", "not-a-uuid"],
    ["tent_id", "not-a-uuid"],
    ["value", Number.NaN],
    ["value", Infinity],
    ["value", "24"],
    ["metric", ""],
    ["source", ""],
    ["quality", 42],
    ["ts", "2026-02-30T00:00:00Z"],
    ["created_at", "not-a-date"],
    ["captured_at", "2026-09-16"],
    ["device_id", 42],
  ])("rejects invalid %s=%j rather than coercing evidence", (key, value) => {
    expect(() => requireEffectiveSensorReadings([row({ [key]: value })])).toThrow(/unavailable/i);
  });

  it("requires raw_payload to be present even when null", () => {
    const { raw_payload: _removed, ...withoutPayload } = row();
    expect(() => requireEffectiveSensorReadings([withoutPayload])).toThrow(/unavailable/i);
  });

  it("does not treat an invalid correction as a zero or empty reading", () => {
    expect(() =>
      requireEffectiveSensorReadings([
        row({ correction_valid: false, value: null, metric: "temperature_c" }),
      ]),
    ).toThrow(/unavailable/i);
  });

  it("preserves microsecond observation timestamps from the database view", () => {
    const decoded = requireEffectiveSensorReadings([row()])[0];
    expect(decoded.ts).toBe(observed);
    expect(decoded.captured_at).toBe(observed);
  });
});

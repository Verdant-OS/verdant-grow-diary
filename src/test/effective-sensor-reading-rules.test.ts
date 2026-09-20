import { describe, expect, it } from "vitest";
import { requireEffectiveSensorReadings } from "@/lib/effectiveSensorReadingRules";

const observed = "2026-09-15T08:00:00.123456+00:00";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const readingId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: readingId,
    user_id: userId,
    tent_id: tentId,
    value: 24,
    metric: "temperature_c",
    source: "manual",
    quality: "ok",
    captured_at: observed,
    ts: observed,
    created_at: observed,
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    ...overrides,
  };
}

describe("requireEffectiveSensorReadings validation fence", () => {
  it("accepts a fully verified effective row", () => {
    expect(requireEffectiveSensorReadings([validRow()])).toEqual([validRow()]);
  });

  it("accepts an empty successful read", () => {
    expect(requireEffectiveSensorReadings([])).toEqual([]);
  });

  it.each(["not-an-array", null, undefined, {}, { rows: [] }])(
    "rejects non-array payload %j",
    (data) => {
      expect(() => requireEffectiveSensorReadings(data)).toThrow(/unavailable/i);
    },
  );

  it.each([null, undefined, "row", 42, []])("rejects non-object row %j", (row) => {
    expect(() => requireEffectiveSensorReadings([row])).toThrow(/unavailable/i);
  });

  it.each([
    ["correction_valid", false],
    ["correction_valid", undefined],
    ["correction_valid", "true"],
    ["id", "not-a-uuid"],
    ["user_id", "not-a-uuid"],
    ["tent_id", "not-a-uuid"],
    ["value", null],
    ["value", NaN],
    ["value", Infinity],
    ["metric", ""],
    ["metric", 42],
    ["source", ""],
    ["source", null],
    ["quality", 42],
    ["ts", "not-a-timestamp"],
    ["created_at", "not-a-timestamp"],
    ["captured_at", "not-a-timestamp"],
    ["device_id", 123],
  ])("rejects row with invalid %s=%j", (field, value) => {
    expect(() => requireEffectiveSensorReadings([validRow({ [field]: value })])).toThrow(
      /unavailable/i,
    );
  });

  it("rejects duplicate row ids in one response", () => {
    const row = validRow();
    expect(() => requireEffectiveSensorReadings([row, row])).toThrow(/unavailable/i);
  });

  it("rejects rows missing the raw_payload key even when the value would be null", () => {
    const { raw_payload: _ignored, ...withoutRawPayload } = validRow();
    expect(() => requireEffectiveSensorReadings([withoutRawPayload])).toThrow(/unavailable/i);
  });

  it("allows captured_at=null while still requiring raw_payload", () => {
    expect(requireEffectiveSensorReadings([validRow({ captured_at: null })])).toEqual([
      validRow({ captured_at: null }),
    ]);
  });

  it("allows a string device_id when present", () => {
    expect(requireEffectiveSensorReadings([validRow({ device_id: "device-1" })])).toEqual([
      validRow({ device_id: "device-1" }),
    ]);
  });
});

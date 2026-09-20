import { describe, expect, it } from "vitest";
import { requireEffectiveSensorReadings } from "@/lib/effectiveSensorReadingRules";

const observed = "2026-09-15T08:00:00.123456+00:00";
const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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

describe("requireEffectiveSensorReadings", () => {
  it("accepts a fully validated effective-view row", () => {
    expect(requireEffectiveSensorReadings([validRow()])).toEqual([validRow()]);
  });

  it("retains a successful empty read", () => {
    expect(requireEffectiveSensorReadings([])).toEqual([]);
  });

  it.each([
    ["duplicate id", [validRow(), validRow({ value: 25 })]],
    [
      "missing raw_payload key",
      [
        (() => {
          const row = validRow();
          delete (row as { raw_payload?: unknown }).raw_payload;
          return row;
        })(),
      ],
    ],
    ["empty metric", [validRow({ metric: "" })]],
    ["empty source", [validRow({ source: "" })]],
    ["invalid user_id", [validRow({ user_id: "owner-a" })]],
    ["invalid tent_id", [validRow({ tent_id: "tent-1" })]],
    ["invalid row id", [validRow({ id: "reading-1" })]],
    ["non-finite value", [validRow({ value: Number.POSITIVE_INFINITY })]],
    ["invalid ts", [validRow({ ts: "not-a-timestamp" })]],
    ["invalid created_at", [validRow({ created_at: "2026-13-40T00:00:00Z" })]],
    ["invalid captured_at when present", [validRow({ captured_at: "bad" })]],
    ["non-string device_id when present", [validRow({ device_id: 42 })]],
  ])("rejects %s without surfacing partial rows", (_label, data) => {
    expect(() => requireEffectiveSensorReadings(data)).toThrow(/unavailable/i);
  });
});
